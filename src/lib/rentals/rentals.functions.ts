import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  RentalBrand,
  RentalContract,
  RentalContractFull,
  RentalContractGuaranteeInput,
  RentalContractGuaranteeItem,
  RentalContractInput,
  RentalContractStatus,
  RentalContractTenantInput,
  RentalGuarantor,
  RentalGuarantorInput,
  RentalKpis,
  RentalPaymentStatus,
  RentalProperty,
  RentalPropertyInput,
  RentalPropertyStatus,
  RentalPropertyType,
  RentalTenant,
  RentalTenantInput,
} from "@/types/rental";

const orNull = (v?: string | null) =>
  v !== undefined && v !== null && String(v).trim() ? String(v).trim() : null;
const numOrNull = (v?: number | null) =>
  v === undefined || v === null || Number.isNaN(Number(v)) ? null : Number(v);

// ----- Row → DTO mappers -----
type PropRow = {
  id: string;
  apelido: string;
  tipo: string;
  logradouro: string;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  quartos: number | null;
  banheiros: number | null;
  vagas: number | null;
  area_m2: number | null;
  valor_sugerido: number | null;
  status: string;
  observacoes: string | null;
  brand: string;
  proprietario_nome: string | null;
  proprietario_cpf: string | null;
  proprietario_email: string | null;
  proprietario_telefone: string | null;
  created_at: string;
  updated_at: string;
};
type TenantRow = {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  telefone: string;
  email: string | null;
  data_nascimento: string | null;
  endereco: string | null;
  profissao: string | null;
  renda_aproximada: number | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};
type GuarantorRow = {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  profissao: string | null;
  vinculo: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};
type ContractRow = {
  id: string;
  property_id: string;
  tenant_id: string;
  guarantor_id: string | null;
  valor_mensal: number;
  valor_caucao: number | null;
  garantia_tipo: string | null;
  seguro_seguradora: string | null;
  seguro_apolice: string | null;
  seguro_valor_mensal: number | null;
  data_inicio: string;
  data_fim: string;
  dia_vencimento: number;
  status: string;
  payment_status: string;
  proximo_vencimento: string | null;
  data_encerramento: string | null;
  observacoes: string | null;
  brand: string;
  created_at: string;
  updated_at: string;
};

function mapProperty(r: PropRow): RentalProperty {
  return {
    id: r.id,
    apelido: r.apelido,
    tipo: r.tipo as RentalPropertyType,
    logradouro: r.logradouro,
    numero: r.numero,
    complemento: r.complemento,
    bairro: r.bairro,
    cidade: r.cidade,
    uf: r.uf,
    cep: r.cep,
    quartos: r.quartos,
    banheiros: r.banheiros,
    vagas: r.vagas,
    areaM2: r.area_m2,
    valorSugerido: r.valor_sugerido,
    status: r.status as RentalPropertyStatus,
    observacoes: r.observacoes,
    brand: r.brand as RentalBrand,
    proprietarioNome: r.proprietario_nome,
    proprietarioCpf: r.proprietario_cpf,
    proprietarioEmail: r.proprietario_email,
    proprietarioTelefone: r.proprietario_telefone,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function mapTenant(r: TenantRow): RentalTenant {
  return {
    id: r.id,
    nome: r.nome,
    cpfCnpj: r.cpf_cnpj,
    telefone: r.telefone,
    email: r.email,
    dataNascimento: r.data_nascimento,
    endereco: r.endereco,
    profissao: r.profissao,
    rendaAproximada: r.renda_aproximada,
    observacoes: r.observacoes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function mapGuarantor(r: GuarantorRow): RentalGuarantor {
  return {
    id: r.id,
    nome: r.nome,
    cpfCnpj: r.cpf_cnpj,
    telefone: r.telefone,
    email: r.email,
    endereco: r.endereco,
    profissao: r.profissao,
    vinculo: r.vinculo,
    observacoes: r.observacoes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function mapContract(r: ContractRow): RentalContract {
  return {
    id: r.id,
    propertyId: r.property_id,
    tenantId: r.tenant_id,
    guarantorId: r.guarantor_id,
    valorMensal: Number(r.valor_mensal),
    valorCaucao: r.valor_caucao !== null ? Number(r.valor_caucao) : null,
    garantiaTipo: (r.garantia_tipo as RentalContract["garantiaTipo"]) ?? "sem_garantia",
    seguroSeguradora: r.seguro_seguradora,
    seguroApolice: r.seguro_apolice,
    seguroValorMensal: r.seguro_valor_mensal !== null ? Number(r.seguro_valor_mensal) : null,
    dataInicio: r.data_inicio,
    dataFim: r.data_fim,
    diaVencimento: r.dia_vencimento,
    status: r.status as RentalContractStatus,
    paymentStatus: r.payment_status as RentalPaymentStatus,
    proximoVencimento: r.proximo_vencimento,
    dataEncerramento: r.data_encerramento,
    observacoes: r.observacoes,
    brand: r.brand as RentalBrand,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function propertyPayload(input: RentalPropertyInput) {
  return {
    apelido: input.apelido.trim(),
    tipo: input.tipo,
    logradouro: input.logradouro.trim(),
    numero: orNull(input.numero),
    complemento: orNull(input.complemento),
    bairro: orNull(input.bairro),
    cidade: orNull(input.cidade),
    uf: orNull(input.uf),
    cep: orNull(input.cep),
    quartos: numOrNull(input.quartos),
    banheiros: numOrNull(input.banheiros),
    vagas: numOrNull(input.vagas),
    area_m2: numOrNull(input.areaM2),
    valor_sugerido: numOrNull(input.valorSugerido),
    status: input.status,
    observacoes: orNull(input.observacoes),
    brand: input.brand,
    proprietario_nome: orNull(input.proprietarioNome),
    proprietario_cpf: orNull(input.proprietarioCpf),
    proprietario_email: orNull(input.proprietarioEmail),
    proprietario_telefone: orNull(input.proprietarioTelefone),
  };
}
function tenantPayload(input: RentalTenantInput) {
  return {
    nome: input.nome.trim(),
    cpf_cnpj: orNull(input.cpfCnpj),
    telefone: (input.telefone ?? "").trim(),
    email: orNull(input.email),
    data_nascimento: orNull(input.dataNascimento),
    endereco: orNull(input.endereco),
    profissao: orNull(input.profissao),
    renda_aproximada: numOrNull(input.rendaAproximada),
    observacoes: orNull(input.observacoes),
  };
}
function guarantorPayload(input: RentalGuarantorInput) {
  return {
    nome: input.nome.trim(),
    cpf_cnpj: orNull(input.cpfCnpj),
    telefone: orNull(input.telefone),
    email: orNull(input.email),
    endereco: orNull(input.endereco),
    profissao: orNull(input.profissao),
    vinculo: orNull(input.vinculo),
    observacoes: orNull(input.observacoes),
  };
}

function nextDueDate(start: string, dia: number): string {
  const today = new Date();
  const base = new Date(start);
  const ref = base > today ? base : today;
  let year = ref.getFullYear();
  let month = ref.getMonth();
  const candidate = new Date(year, month, Math.min(dia, 28));
  if (candidate < ref) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  const d = new Date(year, month, Math.min(dia, 28));
  return d.toISOString().slice(0, 10);
}

type RctRow = {
  id: string;
  contract_id: string;
  tenant_id: string;
  is_primary: boolean;
  position: number;
};
type RcgRow = {
  id: string;
  contract_id: string;
  guarantor_id: string | null;
  tipo: RentalContractGuaranteeItem["tipo"];
  valor_caucao: number | null;
  seguro_seguradora: string | null;
  seguro_apolice: string | null;
  seguro_valor_mensal: number | null;
  is_primary: boolean;
  position: number;
};

type SupabaseCtx = { from: (t: string) => unknown } & Record<string, unknown>;

async function enrichContracts(
  supabase: SupabaseCtx,
  rows: ContractRow[],
): Promise<RentalContractFull[]> {
  if (rows.length === 0) return [];
  const contractIds = rows.map((r) => r.id);
  const propIds = Array.from(new Set(rows.map((r) => r.property_id)));

  const [props, rctRes, rcgRes] = await Promise.all([
    (supabase as any).from("rental_properties").select("*").in("id", propIds),
    (supabase as any).from("rental_contract_tenants").select("*").in("contract_id", contractIds),
    (supabase as any).from("rental_contract_guarantors").select("*").in("contract_id", contractIds),
  ]);
  if (props.error) throw new Error(props.error.message);
  if (rctRes.error) throw new Error(rctRes.error.message);
  if (rcgRes.error) throw new Error(rcgRes.error.message);

  const rcts = (rctRes.data ?? []) as RctRow[];
  const rcgs = (rcgRes.data ?? []) as RcgRow[];

  // Fallback: contracts without join rows still show legacy tenant/guarantor.
  const legacyTenantByContract = new Map<string, string>();
  const legacyGuarantorByContract = new Map<string, string>();
  for (const r of rows) {
    if (!rcts.some((x) => x.contract_id === r.id)) legacyTenantByContract.set(r.id, r.tenant_id);
    if (r.guarantor_id && !rcgs.some((x) => x.contract_id === r.id))
      legacyGuarantorByContract.set(r.id, r.guarantor_id);
  }

  const tenantIds = Array.from(
    new Set([
      ...rcts.map((x) => x.tenant_id),
      ...Array.from(legacyTenantByContract.values()),
      ...rows.map((r) => r.tenant_id),
    ]),
  );
  const guarIds = Array.from(
    new Set(
      [
        ...rcgs.map((x) => x.guarantor_id).filter((v): v is string => Boolean(v)),
        ...Array.from(legacyGuarantorByContract.values()),
      ].filter(Boolean),
    ),
  );

  const [tenants, guarantors] = await Promise.all([
    tenantIds.length
      ? (supabase as any).from("rental_tenants").select("*").in("id", tenantIds)
      : Promise.resolve({ data: [], error: null }),
    guarIds.length
      ? (supabase as any).from("rental_guarantors").select("*").in("id", guarIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (tenants.error) throw new Error(tenants.error.message);
  if (guarantors.error) throw new Error(guarantors.error.message);

  const pMap = new Map(((props.data as PropRow[]) ?? []).map((p) => [p.id, mapProperty(p)]));
  const tMap = new Map(((tenants.data as TenantRow[]) ?? []).map((t) => [t.id, mapTenant(t)]));
  const gMap = new Map(
    ((guarantors.data as GuarantorRow[]) ?? []).map((g) => [g.id, mapGuarantor(g)]),
  );

  const rctByContract = new Map<string, RctRow[]>();
  for (const x of rcts) {
    const arr = rctByContract.get(x.contract_id) ?? [];
    arr.push(x);
    rctByContract.set(x.contract_id, arr);
  }
  const rcgByContract = new Map<string, RcgRow[]>();
  for (const x of rcgs) {
    const arr = rcgByContract.get(x.contract_id) ?? [];
    arr.push(x);
    rcgByContract.set(x.contract_id, arr);
  }

  const result: RentalContractFull[] = [];
  for (const r of rows) {
    const property = pMap.get(r.property_id);
    if (!property) continue;

    // Tenants list from join (or legacy fallback).
    let tenantList: RentalTenant[] = [];
    const joinTenants = (rctByContract.get(r.id) ?? []).slice().sort(
      (a, b) =>
        Number(b.is_primary) - Number(a.is_primary) || a.position - b.position,
    );
    if (joinTenants.length > 0) {
      tenantList = joinTenants
        .map((x) => tMap.get(x.tenant_id))
        .filter((v): v is RentalTenant => Boolean(v));
    } else {
      const t = tMap.get(r.tenant_id);
      if (t) tenantList = [t];
    }
    if (tenantList.length === 0) continue;
    const primaryTenant = tenantList[0];

    // Guarantees list from join (or legacy fallback).
    let guaranteeList: RentalContractGuaranteeItem[] = [];
    const joinGuars = (rcgByContract.get(r.id) ?? []).slice().sort(
      (a, b) =>
        Number(b.is_primary) - Number(a.is_primary) || a.position - b.position,
    );
    if (joinGuars.length > 0) {
      guaranteeList = joinGuars.map((x) => ({
        id: x.id,
        tipo: x.tipo,
        guarantor: x.guarantor_id ? (gMap.get(x.guarantor_id) ?? null) : null,
        valorCaucao: x.valor_caucao !== null ? Number(x.valor_caucao) : null,
        seguroSeguradora: x.seguro_seguradora,
        seguroApolice: x.seguro_apolice,
        seguroValorMensal:
          x.seguro_valor_mensal !== null ? Number(x.seguro_valor_mensal) : null,
        isPrimary: x.is_primary,
      }));
    } else if (r.garantia_tipo && r.garantia_tipo !== "sem_garantia") {
      guaranteeList = [
        {
          tipo: r.garantia_tipo as RentalContractGuaranteeItem["tipo"],
          guarantor: r.guarantor_id ? (gMap.get(r.guarantor_id) ?? null) : null,
          valorCaucao: r.valor_caucao !== null ? Number(r.valor_caucao) : null,
          seguroSeguradora: r.seguro_seguradora,
          seguroApolice: r.seguro_apolice,
          seguroValorMensal:
            r.seguro_valor_mensal !== null ? Number(r.seguro_valor_mensal) : null,
          isPrimary: true,
        },
      ];
    }

    result.push({
      ...mapContract(r),
      property,
      tenant: primaryTenant,
      guarantor: guaranteeList[0]?.guarantor ?? null,
      tenants: tenantList,
      guarantees: guaranteeList,
    });
  }
  return result;
}

// ============================ LIST ============================
export const listRentalContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RentalContractFull[]> => {
    const { data: contracts, error } = await context.supabase
      .from("rental_contracts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return enrichContracts(
      context.supabase as unknown as SupabaseCtx,
      (contracts ?? []) as unknown as ContractRow[],
    );
  });

// ============================ KPIs ============================
export const getRentalKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RentalKpis> => {
    const { data: contracts, error } = await context.supabase
      .from("rental_contracts")
      .select("status,payment_status,valor_mensal,data_fim,proximo_vencimento");
    if (error) throw new Error(error.message);
    const { data: props, error: pErr } = await context.supabase
      .from("rental_properties")
      .select("status");
    if (pErr) throw new Error(pErr.message);

    const list = (contracts ?? []) as Array<{
      status: string;
      payment_status: string;
      valor_mensal: number;
      data_fim: string;
      proximo_vencimento: string | null;
    }>;
    const today = new Date();
    const in30 = new Date();
    in30.setDate(today.getDate() + 30);

    let receita = 0;
    let ativos = 0;
    let pendentes = 0;
    let vencendo = 0;
    let atrasos = 0;

    for (const c of list) {
      if (c.status === "ativo") {
        ativos++;
        receita += Number(c.valor_mensal) || 0;
        const fim = new Date(c.data_fim);
        if (fim >= today && fim <= in30) vencendo++;
      }
      if (c.status === "pendente_assinatura") pendentes++;
      if (c.payment_status === "atrasado") atrasos++;
    }

    const imoveisDisponiveis = (
      (props ?? []) as Array<{ status: string }>
    ).filter((p) => p.status === "disponivel").length;

    return {
      receitaMensalAtiva: receita,
      contratosAtivos: ativos,
      contratosPendentes: pendentes,
      vencendoEm30: vencendo,
      atrasos,
      imoveisDisponiveis,
    };
  });

// ============================ LOOKUPS ============================
export const listRentalProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RentalProperty[]> => {
    const { data, error } = await context.supabase
      .from("rental_properties")
      .select("*")
      .order("apelido", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as PropRow[]).map(mapProperty);
  });

export const listRentalTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RentalTenant[]> => {
    const { data, error } = await context.supabase
      .from("rental_tenants")
      .select("*")
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as TenantRow[]).map(mapTenant);
  });

// ============================ CREATE ============================
function normalizeTenants(input: RentalContractInput): RentalContractTenantInput[] {
  const arr = (input.tenants ?? []).filter(
    (t): t is RentalContractTenantInput => !!t && !!(t.existingId || t.data),
  );
  if (arr.length > 0) return arr;
  if (input.tenant) return [input.tenant];
  return [];
}

function normalizeGuarantees(input: RentalContractInput): RentalContractGuaranteeInput[] {
  const arr = (input.guarantees ?? []).filter((g) => !!g && !!g.tipo);
  if (arr.length > 0) return arr;
  const t = input.garantiaTipo;
  if (!t || t === "sem_garantia") return [];
  return [
    {
      tipo: t,
      guarantor: input.guarantor ?? null,
      valorCaucao: input.valorCaucao ?? null,
      seguroSeguradora: input.seguroSeguradora ?? null,
      seguroApolice: input.seguroApolice ?? null,
      seguroValorMensal: input.seguroValorMensal ?? null,
    },
  ];
}

function validateInput(input: RentalContractInput) {
  if (!input.property?.existingId && !input.property?.data?.apelido?.trim())
    throw new Error("Selecione ou cadastre um imóvel.");
  const tenants = normalizeTenants(input);
  if (tenants.length === 0) throw new Error("Adicione pelo menos um locatário.");
  for (const t of tenants) {
    if (!t.existingId) {
      if (!t.data?.nome?.trim()) throw new Error("Nome do locatário é obrigatório.");
      const tel = (t.data?.telefone ?? "").replace(/\D/g, "");
      if (tel.length < 10) throw new Error("Informe um telefone válido para todos os locatários.");
      const email = t.data?.email;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error("E-mail de locatário inválido.");
    }
  }
  const guarantees = normalizeGuarantees(input);
  for (const g of guarantees) {
    if (g.tipo === "fiador") {
      if (!g.guarantor?.existingId && !g.guarantor?.data?.nome?.trim())
        throw new Error("Informe o nome de todos os fiadores.");
    } else if (g.tipo === "caucao") {
      if (!g.valorCaucao || Number(g.valorCaucao) <= 0)
        throw new Error("Informe o valor da caução.");
    } else if (g.tipo === "seguro_fianca") {
      if (!g.seguroSeguradora?.trim()) throw new Error("Informe a seguradora do seguro fiança.");
    }
  }
  if (!input.valorMensal || input.valorMensal <= 0)
    throw new Error("Informe um valor mensal maior que zero.");
  if (!input.dataInicio) throw new Error("Informe a data de início.");
  if (!input.dataFim) throw new Error("Informe a data de fim.");
  if (new Date(input.dataFim) <= new Date(input.dataInicio))
    throw new Error("A data de fim deve ser posterior à data de início.");
  if (input.diaVencimento < 1 || input.diaVencimento > 31)
    throw new Error("Dia de vencimento inválido.");
}

export const createRentalContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: RentalContractInput) => d)
  .handler(async ({ data, context }): Promise<RentalContractFull> => {
    validateInput(data);
    const supabase = context.supabase;
    const tenantsIn = normalizeTenants(data);
    const guaranteesIn = normalizeGuarantees(data);

    // 1. Property
    let propertyId = data.property.existingId ?? null;
    if (!propertyId) {
      const payload = { ...propertyPayload(data.property.data!), created_by: context.userId };
      const { data: inserted, error } = await supabase
        .from("rental_properties")
        .insert(payload as never)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      propertyId = (inserted as unknown as PropRow).id;
    }

    // 1b. Block duplicate active contract for the property
    if (data.status === "ativo" || data.status === "pendente_assinatura") {
      const { data: dup, error: dupErr } = await supabase
        .from("rental_contracts")
        .select("id")
        .eq("property_id", propertyId)
        .in("status", ["ativo", "pendente_assinatura"]);
      if (dupErr) throw new Error(dupErr.message);
      if ((dup ?? []).length > 0)
        throw new Error("Este imóvel já possui um contrato ativo ou pendente.");
    }

    // 2. Tenants (resolve, insert, or update-in-place)
    const tenantIds: string[] = [];
    for (const t of tenantsIn) {
      if (t.existingId) {
        if (t.data && t.data.nome?.trim()) {
          const { error: upErr } = await supabase
            .from("rental_tenants")
            .update(tenantPayload(t.data) as never)
            .eq("id", t.existingId);
          if (upErr) throw new Error(upErr.message);
        }
        tenantIds.push(t.existingId);
      } else {
        const payload = { ...tenantPayload(t.data!), created_by: context.userId };
        const { data: inserted, error } = await supabase
          .from("rental_tenants")
          .insert(payload as never)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        tenantIds.push((inserted as unknown as TenantRow).id);
      }
    }
    const primaryTenantId = tenantIds[0];

    // 3. Guarantees: resolve fiador guarantors first
    type ResolvedGuarantee = RentalContractGuaranteeInput & { guarantorId: string | null };
    const resolved: ResolvedGuarantee[] = [];
    for (const g of guaranteesIn) {
      let guarantorId: string | null = null;
      if (g.tipo === "fiador") {
        if (g.guarantor?.existingId) {
          if (g.guarantor.data && g.guarantor.data.nome?.trim()) {
            const { error: upErr } = await supabase
              .from("rental_guarantors")
              .update(guarantorPayload(g.guarantor.data) as never)
              .eq("id", g.guarantor.existingId);
            if (upErr) throw new Error(upErr.message);
          }
          guarantorId = g.guarantor.existingId;
        } else if (g.guarantor?.data?.nome?.trim()) {
          const payload = {
            ...guarantorPayload(g.guarantor.data),
            created_by: context.userId,
          };
          const { data: inserted, error } = await supabase
            .from("rental_guarantors")
            .insert(payload as never)
            .select("*")
            .single();
          if (error) throw new Error(error.message);
          guarantorId = (inserted as unknown as GuarantorRow).id;
        }
      }
      resolved.push({ ...g, guarantorId });
    }
    const primaryGuarantee = resolved[0] ?? null;

    // 4. Contract (legacy columns = primary values for back-compat)
    const contractPayload = {
      created_by: context.userId,
      property_id: propertyId,
      tenant_id: primaryTenantId,
      guarantor_id: primaryGuarantee?.guarantorId ?? null,
      valor_mensal: Number(data.valorMensal),
      valor_caucao:
        primaryGuarantee?.tipo === "caucao"
          ? numOrNull(primaryGuarantee.valorCaucao)
          : null,
      garantia_tipo: primaryGuarantee?.tipo ?? "sem_garantia",
      seguro_seguradora:
        primaryGuarantee?.tipo === "seguro_fianca"
          ? orNull(primaryGuarantee.seguroSeguradora)
          : null,
      seguro_apolice:
        primaryGuarantee?.tipo === "seguro_fianca"
          ? orNull(primaryGuarantee.seguroApolice)
          : null,
      seguro_valor_mensal:
        primaryGuarantee?.tipo === "seguro_fianca"
          ? numOrNull(primaryGuarantee.seguroValorMensal)
          : null,
      data_inicio: data.dataInicio.slice(0, 10),
      data_fim: data.dataFim.slice(0, 10),
      dia_vencimento: data.diaVencimento,
      status: data.status,
      payment_status: data.paymentStatus ?? "pendente",
      proximo_vencimento:
        data.proximoVencimento ?? nextDueDate(data.dataInicio, data.diaVencimento),
      observacoes: orNull(data.observacoes),
      brand: data.brand ?? "cordial",
    };
    const { data: inserted, error: cErr } = await supabase
      .from("rental_contracts")
      .insert(contractPayload as never)
      .select("*")
      .single();
    if (cErr) throw new Error(cErr.message);
    const contractRow = inserted as unknown as ContractRow;

    // 5. Join rows — tenants
    const rctPayload = tenantIds.map((tid, i) => ({
      contract_id: contractRow.id,
      tenant_id: tid,
      is_primary: i === 0,
      position: i,
    }));
    if (rctPayload.length > 0) {
      const { error: rctErr } = await supabase
        .from("rental_contract_tenants")
        .insert(rctPayload as never);
      if (rctErr) throw new Error(rctErr.message);
    }

    // 6. Join rows — guarantees
    const rcgPayload = resolved.map((g, i) => ({
      contract_id: contractRow.id,
      guarantor_id: g.guarantorId,
      tipo: g.tipo,
      valor_caucao: g.tipo === "caucao" ? numOrNull(g.valorCaucao) : null,
      seguro_seguradora: g.tipo === "seguro_fianca" ? orNull(g.seguroSeguradora) : null,
      seguro_apolice: g.tipo === "seguro_fianca" ? orNull(g.seguroApolice) : null,
      seguro_valor_mensal:
        g.tipo === "seguro_fianca" ? numOrNull(g.seguroValorMensal) : null,
      is_primary: i === 0,
      position: i,
    }));
    if (rcgPayload.length > 0) {
      const { error: rcgErr } = await supabase
        .from("rental_contract_guarantors")
        .insert(rcgPayload as never);
      if (rcgErr) throw new Error(rcgErr.message);
    }

    const full = await enrichContracts(supabase as unknown as SupabaseCtx, [contractRow]);
    return full[0];
  });

// ============================ UPDATE ============================
export const updateRentalContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id: string;
      contract?: Partial<{
        valorMensal: number;
        valorCaucao: number | null;
        dataInicio: string;
        dataFim: string;
        diaVencimento: number;
        status: RentalContractStatus;
        paymentStatus: RentalPaymentStatus;
        proximoVencimento: string | null;
        observacoes: string | null;
      }>;
      property?: Partial<RentalPropertyInput> & { id?: string };
      tenant?: Partial<RentalTenantInput> & { id?: string };
      guarantor?: (Partial<RentalGuarantorInput> & { id?: string }) | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    if (data.contract) {
      const patch: Record<string, unknown> = {};
      if (data.contract.valorMensal !== undefined)
        patch.valor_mensal = Number(data.contract.valorMensal);
      if (data.contract.valorCaucao !== undefined)
        patch.valor_caucao = numOrNull(data.contract.valorCaucao);
      if (data.contract.dataInicio !== undefined)
        patch.data_inicio = data.contract.dataInicio.slice(0, 10);
      if (data.contract.dataFim !== undefined)
        patch.data_fim = data.contract.dataFim.slice(0, 10);
      if (data.contract.diaVencimento !== undefined)
        patch.dia_vencimento = data.contract.diaVencimento;
      if (data.contract.status !== undefined) patch.status = data.contract.status;
      if (data.contract.paymentStatus !== undefined)
        patch.payment_status = data.contract.paymentStatus;
      if (data.contract.proximoVencimento !== undefined)
        patch.proximo_vencimento = data.contract.proximoVencimento;
      if (data.contract.observacoes !== undefined)
        patch.observacoes = orNull(data.contract.observacoes);
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase
          .from("rental_contracts")
          .update(patch as never)
          .eq("id", data.id);
        if (error) throw new Error(error.message);
      }
    }
    if (data.property?.id) {
      const { id, ...rest } = data.property;
      const patch = propertyPayload({
        apelido: rest.apelido ?? "",
        tipo: (rest.tipo as RentalPropertyType) ?? "apartamento",
        logradouro: rest.logradouro ?? "",
        numero: rest.numero ?? null,
        complemento: rest.complemento ?? null,
        bairro: rest.bairro ?? null,
        cidade: rest.cidade ?? null,
        uf: rest.uf ?? null,
        cep: rest.cep ?? null,
        quartos: rest.quartos ?? null,
        banheiros: rest.banheiros ?? null,
        vagas: rest.vagas ?? null,
        areaM2: rest.areaM2 ?? null,
        valorSugerido: rest.valorSugerido ?? null,
        status: (rest.status as RentalPropertyStatus) ?? "disponivel",
        observacoes: rest.observacoes ?? null,
        brand: (rest.brand as RentalBrand) ?? "cordial",
        proprietarioNome: rest.proprietarioNome ?? null,
        proprietarioCpf: rest.proprietarioCpf ?? null,
        proprietarioEmail: rest.proprietarioEmail ?? null,
        proprietarioTelefone: rest.proprietarioTelefone ?? null,
      });
      const { error } = await supabase
        .from("rental_properties")
        .update(patch as never)
        .eq("id", id);
      if (error) throw new Error(error.message);
    }
    if (data.tenant?.id) {
      const { id, ...rest } = data.tenant;
      const patch = tenantPayload({
        nome: rest.nome ?? "",
        cpfCnpj: rest.cpfCnpj ?? null,
        telefone: rest.telefone ?? "",
        email: rest.email ?? null,
        dataNascimento: rest.dataNascimento ?? null,
        endereco: rest.endereco ?? null,
        profissao: rest.profissao ?? null,
        rendaAproximada: rest.rendaAproximada ?? null,
        observacoes: rest.observacoes ?? null,
      });
      const { error } = await supabase
        .from("rental_tenants")
        .update(patch as never)
        .eq("id", id);
      if (error) throw new Error(error.message);
    }
    if (data.guarantor?.id) {
      const { id, ...rest } = data.guarantor;
      const patch = guarantorPayload({
        nome: rest.nome ?? "",
        cpfCnpj: rest.cpfCnpj ?? null,
        telefone: rest.telefone ?? null,
        email: rest.email ?? null,
        endereco: rest.endereco ?? null,
        profissao: rest.profissao ?? null,
        vinculo: rest.vinculo ?? null,
        observacoes: rest.observacoes ?? null,
      });
      const { error } = await supabase
        .from("rental_guarantors")
        .update(patch as never)
        .eq("id", id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ============================ CLOSE / RENEW / PAY ============================
export const closeRentalContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await context.supabase
      .from("rental_contracts")
      .update({ status: "encerrado", data_encerramento: today } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const renewRentalContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; novaDataFim: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("rental_contracts")
      .update({ data_fim: data.novaDataFim.slice(0, 10), status: "ativo" } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markRentalPaymentPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error: rErr } = await context.supabase
      .from("rental_contracts")
      .select("dia_vencimento,proximo_vencimento,data_inicio")
      .eq("id", data.id)
      .single();
    if (rErr) throw new Error(rErr.message);
    const r = row as unknown as {
      dia_vencimento: number;
      proximo_vencimento: string | null;
      data_inicio: string;
    };
    const base = r.proximo_vencimento ?? r.data_inicio;
    const next = (() => {
      const d = new Date(base);
      d.setMonth(d.getMonth() + 1);
      d.setDate(Math.min(r.dia_vencimento, 28));
      return d.toISOString().slice(0, 10);
    })();
    const { error } = await context.supabase
      .from("rental_contracts")
      .update({ payment_status: "pago", proximo_vencimento: next } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, proximoVencimento: next };
  });

export const deleteRentalContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("rental_contracts")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================ DOCUMENTS ============================
const DOCS_BUCKET = "rental-documents";
const MAX_DOC_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

type DocRow = {
  id: string;
  contract_id: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

async function signDoc(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  filePath: string,
): Promise<string | null> {
  const { data } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(filePath, 60 * 60);
  return data?.signedUrl ?? null;
}

export const listRentalContractDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contractId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("rental_contract_documents")
      .select("id,contract_id,file_path,file_name,mime_type,size_bytes,created_at")
      .eq("contract_id", data.contractId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as unknown as DocRow[];
    const withUrls = await Promise.all(
      list.map(async (r) => ({
        id: r.id,
        contractId: r.contract_id,
        fileName: r.file_name,
        filePath: r.file_path,
        mimeType: r.mime_type,
        sizeBytes: r.size_bytes,
        url: await signDoc(context.supabase, r.file_path),
        createdAt: r.created_at,
      })),
    );
    return withUrls;
  });

export const uploadRentalContractDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { contractId: string; fileName: string; mimeType: string; base64: string }) => d,
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    if (!data.contractId) throw new Error("Contrato inválido.");
    if (!data.fileName?.trim()) throw new Error("Nome do arquivo inválido.");
    const mime = (data.mimeType || "application/octet-stream").toLowerCase();
    if (!ALLOWED_MIME.has(mime))
      throw new Error("Tipo de arquivo não permitido. Envie PDF, imagem ou documento.");

    // Verify caller can access this contract (RLS on select enforces the same rule).
    const { data: contractRow, error: cErr } = await supabase
      .from("rental_contracts")
      .select("id")
      .eq("id", data.contractId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!contractRow) throw new Error("Contrato não encontrado.");

    const raw = data.base64.includes(",") ? data.base64.split(",")[1] : data.base64;
    const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    if (bytes.byteLength === 0) throw new Error("Arquivo vazio.");
    if (bytes.byteLength > MAX_DOC_BYTES) throw new Error("Arquivo excede 50 MB.");

    const safeName = data.fileName.replace(/[^\w.\-]+/g, "_").slice(0, 120);
    const filePath = `${data.contractId}/${crypto.randomUUID()}-${safeName}`;

    const { error: upErr } = await supabase.storage
      .from(DOCS_BUCKET)
      .upload(filePath, bytes, { contentType: mime, upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { data: inserted, error: insErr } = await supabase
      .from("rental_contract_documents")
      .insert({
        contract_id: data.contractId,
        file_path: filePath,
        file_name: safeName,
        mime_type: mime,
        size_bytes: bytes.byteLength,
        uploaded_by: context.userId,
      } as never)
      .select("id,contract_id,file_path,file_name,mime_type,size_bytes,created_at")
      .single();
    if (insErr) {
      await supabase.storage.from(DOCS_BUCKET).remove([filePath]);
      throw new Error(insErr.message);
    }
    const r = inserted as unknown as DocRow;
    return {
      id: r.id,
      contractId: r.contract_id,
      fileName: r.file_name,
      filePath: r.file_path,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      url: await signDoc(supabase, r.file_path),
      createdAt: r.created_at,
    };
  });

export const registerRentalContractDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      contractId: string;
      fileName: string;
      filePath: string;
      mimeType: string;
      sizeBytes: number;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    if (!data.contractId) throw new Error("Contrato inválido.");
    if (!data.fileName?.trim()) throw new Error("Nome do arquivo inválido.");
    if (!data.filePath?.trim()) throw new Error("Caminho do arquivo inválido.");
    const mime = (data.mimeType || "application/octet-stream").toLowerCase();
    if (!ALLOWED_MIME.has(mime))
      throw new Error("Tipo de arquivo não permitido. Envie PDF, imagem ou documento.");
    if (!Number.isFinite(data.sizeBytes) || data.sizeBytes <= 0)
      throw new Error("Arquivo vazio.");
    if (data.sizeBytes > MAX_DOC_BYTES) throw new Error("Arquivo excede 50 MB.");

    // Ensure filePath belongs to this contract (matches storage RLS convention).
    const prefix = `${data.contractId}/`;
    if (!data.filePath.startsWith(prefix))
      throw new Error("Caminho do arquivo não pertence ao contrato.");

    // Verify caller can access this contract (RLS on select enforces the same rule).
    const { data: contractRow, error: cErr } = await supabase
      .from("rental_contracts")
      .select("id")
      .eq("id", data.contractId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!contractRow) {
      await supabase.storage.from(DOCS_BUCKET).remove([data.filePath]);
      throw new Error("Contrato não encontrado.");
    }

    const safeName = data.fileName.replace(/[^\w.\-]+/g, "_").slice(0, 120);

    const { data: inserted, error: insErr } = await supabase
      .from("rental_contract_documents")
      .insert({
        contract_id: data.contractId,
        file_path: data.filePath,
        file_name: safeName,
        mime_type: mime,
        size_bytes: data.sizeBytes,
        uploaded_by: context.userId,
      } as never)
      .select("id,contract_id,file_path,file_name,mime_type,size_bytes,created_at")
      .single();
    if (insErr) {
      await supabase.storage.from(DOCS_BUCKET).remove([data.filePath]);
      throw new Error(insErr.message);
    }
    const r = inserted as unknown as DocRow;
    return {
      id: r.id,
      contractId: r.contract_id,
      fileName: r.file_name,
      filePath: r.file_path,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      url: await signDoc(supabase, r.file_path),
      createdAt: r.created_at,
    };
  });

export const deleteRentalContractDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("rental_contract_documents")
      .select("file_path")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Documento não encontrado.");
    const path = (row as unknown as { file_path: string }).file_path;

    const { error: delErr } = await context.supabase
      .from("rental_contract_documents")
      .delete()
      .eq("id", data.id);
    if (delErr) throw new Error(delErr.message);
    await context.supabase.storage.from(DOCS_BUCKET).remove([path]);
    return { ok: true };
  });

// ============================ REPLACE (edit full contract) ============================
/**
 * Rebuild a contract entirely: base fields + tenants + guarantees.
 * Wipes join rows for the contract and re-inserts from input. Creates
 * new tenants/guarantors on the fly when `existingId` is not provided.
 */
export const replaceRentalContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: RentalContractInput & { contractId: string }) => d)
  .handler(async ({ data, context }): Promise<RentalContractFull> => {
    if (!data.contractId) throw new Error("Contrato inválido para edição.");
    validateInput(data);
    const supabase = context.supabase;
    const tenantsIn = normalizeTenants(data);
    const guaranteesIn = normalizeGuarantees(data);

    // 1. Property (allow swap, re-edit, or owner update on existing)
    let propertyId = data.property.existingId ?? null;
    if (!propertyId) {
      const payload = { ...propertyPayload(data.property.data!), created_by: context.userId };
      const { data: inserted, error } = await supabase
        .from("rental_properties")
        .insert(payload as never)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      propertyId = (inserted as unknown as PropRow).id;
    } else if (data.property.data) {
      // Update owner (and other editable) fields on the existing property row.
      const patch = propertyPayload(data.property.data);
      const { error } = await supabase
        .from("rental_properties")
        .update(patch as never)
        .eq("id", propertyId);
      if (error) throw new Error(error.message);
    }

    // 2. Tenants (resolve, insert, or update-in-place)
    const tenantIds: string[] = [];
    for (const t of tenantsIn) {
      if (t.existingId) {
        if (t.data && t.data.nome?.trim()) {
          const { error: upErr } = await supabase
            .from("rental_tenants")
            .update(tenantPayload(t.data) as never)
            .eq("id", t.existingId);
          if (upErr) throw new Error(upErr.message);
        }
        tenantIds.push(t.existingId);
      } else {
        const payload = { ...tenantPayload(t.data!), created_by: context.userId };
        const { data: inserted, error } = await supabase
          .from("rental_tenants")
          .insert(payload as never)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        tenantIds.push((inserted as unknown as TenantRow).id);
      }
    }
    const primaryTenantId = tenantIds[0];

    // 3. Guarantees: resolve fiador guarantors
    type ResolvedGuarantee = RentalContractGuaranteeInput & { guarantorId: string | null };
    const resolved: ResolvedGuarantee[] = [];
    for (const g of guaranteesIn) {
      let guarantorId: string | null = null;
      if (g.tipo === "fiador") {
        if (g.guarantor?.existingId) {
          if (g.guarantor.data && g.guarantor.data.nome?.trim()) {
            const { error: upErr } = await supabase
              .from("rental_guarantors")
              .update(guarantorPayload(g.guarantor.data) as never)
              .eq("id", g.guarantor.existingId);
            if (upErr) throw new Error(upErr.message);
          }
          guarantorId = g.guarantor.existingId;
        } else if (g.guarantor?.data?.nome?.trim()) {
          const payload = { ...guarantorPayload(g.guarantor.data), created_by: context.userId };
          const { data: inserted, error } = await supabase
            .from("rental_guarantors")
            .insert(payload as never)
            .select("*")
            .single();
          if (error) throw new Error(error.message);
          guarantorId = (inserted as unknown as GuarantorRow).id;
        }
      }
      resolved.push({ ...g, guarantorId });
    }
    const primaryGuarantee = resolved[0] ?? null;

    // 4. Update contract base row
    const patch = {
      property_id: propertyId,
      tenant_id: primaryTenantId,
      guarantor_id: primaryGuarantee?.guarantorId ?? null,
      valor_mensal: Number(data.valorMensal),
      valor_caucao:
        primaryGuarantee?.tipo === "caucao" ? numOrNull(primaryGuarantee.valorCaucao) : null,
      garantia_tipo: primaryGuarantee?.tipo ?? "sem_garantia",
      seguro_seguradora:
        primaryGuarantee?.tipo === "seguro_fianca"
          ? orNull(primaryGuarantee.seguroSeguradora)
          : null,
      seguro_apolice:
        primaryGuarantee?.tipo === "seguro_fianca"
          ? orNull(primaryGuarantee.seguroApolice)
          : null,
      seguro_valor_mensal:
        primaryGuarantee?.tipo === "seguro_fianca"
          ? numOrNull(primaryGuarantee.seguroValorMensal)
          : null,
      data_inicio: data.dataInicio.slice(0, 10),
      data_fim: data.dataFim.slice(0, 10),
      dia_vencimento: data.diaVencimento,
      status: data.status,
      payment_status: data.paymentStatus ?? "pendente",
      proximo_vencimento:
        data.proximoVencimento ?? nextDueDate(data.dataInicio, data.diaVencimento),
      observacoes: orNull(data.observacoes),
      brand: data.brand ?? "cordial",
    };
    const { data: updated, error: uErr } = await supabase
      .from("rental_contracts")
      .update(patch as never)
      .eq("id", data.contractId)
      .select("*")
      .single();
    if (uErr) throw new Error(uErr.message);
    const contractRow = updated as unknown as ContractRow;

    // 5. Rebuild join rows — tenants
    const { error: delTErr } = await supabase
      .from("rental_contract_tenants")
      .delete()
      .eq("contract_id", contractRow.id);
    if (delTErr) throw new Error(delTErr.message);
    const rctPayload = tenantIds.map((tid, i) => ({
      contract_id: contractRow.id,
      tenant_id: tid,
      is_primary: i === 0,
      position: i,
    }));
    if (rctPayload.length > 0) {
      const { error: rctErr } = await supabase
        .from("rental_contract_tenants")
        .insert(rctPayload as never);
      if (rctErr) throw new Error(rctErr.message);
    }

    // 6. Rebuild join rows — guarantees
    const { error: delGErr } = await supabase
      .from("rental_contract_guarantors")
      .delete()
      .eq("contract_id", contractRow.id);
    if (delGErr) throw new Error(delGErr.message);
    const rcgPayload = resolved.map((g, i) => ({
      contract_id: contractRow.id,
      guarantor_id: g.guarantorId,
      tipo: g.tipo,
      valor_caucao: g.tipo === "caucao" ? numOrNull(g.valorCaucao) : null,
      seguro_seguradora: g.tipo === "seguro_fianca" ? orNull(g.seguroSeguradora) : null,
      seguro_apolice: g.tipo === "seguro_fianca" ? orNull(g.seguroApolice) : null,
      seguro_valor_mensal:
        g.tipo === "seguro_fianca" ? numOrNull(g.seguroValorMensal) : null,
      is_primary: i === 0,
      position: i,
    }));
    if (rcgPayload.length > 0) {
      const { error: rcgErr } = await supabase
        .from("rental_contract_guarantors")
        .insert(rcgPayload as never);
      if (rcgErr) throw new Error(rcgErr.message);
    }

    const full = await enrichContracts(supabase as unknown as SupabaseCtx, [contractRow]);
    return full[0];
  });
