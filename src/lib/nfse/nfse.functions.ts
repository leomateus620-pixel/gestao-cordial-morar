import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildNfseXml, inferTomadorTipo, onlyDigits } from "./ipm/xml";
import type { NfsePayload } from "./ipm/xml";
import {
  assertCompetenciaPermitida,
  buildIdentificador,
  classifyResult,
  competenciaFromVencimento,
  currentYmSaoPaulo,
  checkMarkNotIssued,
  PROCESSANDO_STALE_MS,
  reclassifyFromRaw,
  resolveModoTeste,
  type EmissionStatus,
} from "./emission-rules";
import {
  isAllowedEndpoint,
  isSantaRosa,
  isValidEmail,
  isValidTaxDoc,
  normalizePhone,
  normalizeTaxDoc,
  validateNfseSettings,
} from "./validation";

export type NfseBrand = "cordial" | "morar";

export type NfseSettings = {
  brand: NfseBrand;
  cnpj: string;
  inscricaoMunicipal: string | null;
  razaoSocial: string | null;
  cidadeTom: string;
  codigoIbgeMunicipio: string;
  codigoItemListaServico: string;
  codigoNbs: string | null;
  aliquotaIss: number;
  situacaoTributaria: string;
  tributaMunicipioPrestador: "S" | "N";
  cIndOp: string;
  cst: string;
  cClassTrib: string;
  modoTeste: boolean;
  simplesNacional: boolean;
  /** Nunca expomos o valor da senha — apenas se ela existe no servidor. */
  senhaConfigurada: boolean;
};

export type NfseEmission = {
  id: string;
  contractId: string;
  brand: string;
  competencia: string;
  valor: number;
  status: EmissionStatus;
  modoTeste: boolean;
  /** Sempre null em linhas de teste (prévia sem valor fiscal). */
  numeroNfse: string | null;
  serieNfse: string | null;
  codigoVerificador: string | null;
  linkPdf: string | null;
  errorMessage: string | null;
  errorCodes: string[];
  identificador: string | null;
  httpStatus: number | null;
  durationMs: number | null;
  attempts: number;
  createdAt: string;
  updatedAt: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolutionReason: string | null;
};

type SettingsRow = {
  brand: string;
  cnpj: string;
  inscricao_municipal: string | null;
  razao_social: string | null;
  cidade_tom: string;
  codigo_ibge_municipio: string;
  endpoint_url: string;
  codigo_item_lista_servico: string;
  codigo_nbs: string | null;
  aliquota_iss: number | string;
  situacao_tributaria: string;
  tributa_municipio_prestador: string;
  ibs_cbs_c_ind_op: string;
  ibs_cbs_cst: string;
  ibs_cbs_c_class_trib: string;
  modo_teste: boolean;
  simples_nacional: boolean;
};

type EmissionRow = {
  id: string;
  contract_id: string;
  brand: string;
  competencia: string;
  valor: number | string;
  status: string;
  modo_teste: boolean;
  numero_nfse: string | null;
  serie_nfse: string | null;
  codigo_verificador: string | null;
  link_pdf: string | null;
  error_message: string | null;
  error_codes: string[] | null;
  identificador: string | null;
  http_status: number | null;
  duration_ms: number | null;
  attempts: number | null;
  created_at: string;
  updated_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_reason: string | null;
  request_xml?: string | null;
};

const EMISSION_COLUMNS =
  "id,contract_id,brand,competencia,valor,status,modo_teste,numero_nfse,serie_nfse,codigo_verificador,link_pdf,error_message,error_codes,identificador,http_status,duration_ms,attempts,created_at,updated_at,resolved_by,resolved_at,resolution_reason";

const STATUSES: EmissionStatus[] = ["teste_ok", "emitida", "erro", "cancelada", "processando", "incerto", "nao_emitida"];

export function normalizeNfseBrand(brand: string | null | undefined): NfseBrand {
  return brand === "morar" ? "morar" : "cordial";
}

function secretNames(brand: NfseBrand) {
  const suffix = brand.toUpperCase();
  return { login: `IPM_NFSE_LOGIN_${suffix}`, senha: `IPM_NFSE_SENHA_${suffix}` };
}

function readSecret(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

function mapSettings(row: SettingsRow, senhaConfigurada: boolean): NfseSettings {
  return {
    brand: normalizeNfseBrand(row.brand),
    cnpj: row.cnpj ?? "",
    inscricaoMunicipal: row.inscricao_municipal,
    razaoSocial: row.razao_social,
    cidadeTom: row.cidade_tom,
    codigoIbgeMunicipio: row.codigo_ibge_municipio,
    codigoItemListaServico: row.codigo_item_lista_servico,
    codigoNbs: row.codigo_nbs,
    aliquotaIss: Number(row.aliquota_iss ?? 0),
    situacaoTributaria: row.situacao_tributaria,
    tributaMunicipioPrestador: row.tributa_municipio_prestador === "N" ? "N" : "S",
    cIndOp: row.ibs_cbs_c_ind_op,
    cst: row.ibs_cbs_cst,
    cClassTrib: row.ibs_cbs_c_class_trib,
    modoTeste: row.modo_teste,
    simplesNacional: row.simples_nacional,
    senhaConfigurada,
  };
}

function mapEmission(row: EmissionRow): NfseEmission {
  const teste = row.modo_teste;
  return {
    id: row.id,
    contractId: row.contract_id,
    brand: row.brand,
    competencia: row.competencia,
    valor: Number(row.valor ?? 0),
    status: (STATUSES.includes(row.status as EmissionStatus) ? row.status : "erro") as EmissionStatus,
    modoTeste: teste,
    numeroNfse: teste ? null : row.numero_nfse,
    serieNfse: teste ? null : row.serie_nfse,
    codigoVerificador: teste ? null : row.codigo_verificador,
    linkPdf: teste ? null : row.link_pdf,
    errorMessage: row.error_message,
    errorCodes: row.error_codes ?? [],
    identificador: row.identificador,
    httpStatus: row.http_status,
    durationMs: row.duration_ms,
    attempts: row.attempts ?? 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedBy: row.resolved_by,
    resolvedByName: null,
    resolvedAt: row.resolved_at,
    resolutionReason: row.resolution_reason,
  };
}

type AuthedSupabase = {
  rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" | "financeiro" }) => Promise<{
    data: unknown;
  }>;
};

async function assertFiscalRole(supabase: AuthedSupabase, userId: string) {
  const [admin, financeiro] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "financeiro" }),
  ]);
  if (!admin.data && !financeiro.data) {
    throw new Error("Apenas a administração ou o financeiro podem emitir NFS-e.");
  }
}

type DbClient = {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

async function loadSettings(db: DbClient, brand: NfseBrand): Promise<SettingsRow> {
  const { data, error } = await db.from("nfse_provider_settings").select("*").eq("brand", brand).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Configuração fiscal não encontrada para esta marca.");
  return data as SettingsRow;
}

const brandInput = z.object({ brand: z.enum(["cordial", "morar"]).optional() });
const uuid = z.string().uuid();
const ym = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência inválida: use AAAA-MM.");

function zParse<T>(schema: z.ZodType<T>, d: unknown): T {
  const r = schema.safeParse(d ?? {});
  if (!r.success) throw new Error(r.error.issues.map((i) => i.message).join("; "));
  return r.data;
}

export const getNfseSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand?: string } | undefined) => zParse(brandInput, d))
  .handler(async ({ data, context }) => {
    await assertFiscalRole(context.supabase as unknown as AuthedSupabase, context.userId);
    const brand = normalizeNfseBrand(data.brand);
    const row = await loadSettings(context.supabase as unknown as DbClient, brand);
    return mapSettings(row, Boolean(readSecret(secretNames(brand).senha)));
  });

const saveSchema = z.object({
  brand: z.enum(["cordial", "morar"]),
  cnpj: z.string().max(30).optional(),
  inscricaoMunicipal: z.string().max(30).nullable().optional(),
  razaoSocial: z.string().max(150).nullable().optional(),
  codigoItemListaServico: z.string().max(20).optional(),
  codigoNbs: z.string().max(20).nullable().optional(),
  aliquotaIss: z.number().optional(),
  situacaoTributaria: z.string().max(10).optional(),
  tributaMunicipioPrestador: z.enum(["S", "N"]).optional(),
  cIndOp: z.string().max(10).optional(),
  cst: z.string().max(10).optional(),
  cClassTrib: z.string().max(10).optional(),
  modoTeste: z.boolean().optional(),
  simplesNacional: z.boolean().optional(),
});

export const saveNfseSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof saveSchema>) => zParse(saveSchema, d))
  .handler(async ({ data, context }) => {
    await assertFiscalRole(context.supabase as unknown as AuthedSupabase, context.userId);
    const brand = normalizeNfseBrand(data.brand);
    const errors = validateNfseSettings({
      cnpj: data.cnpj,
      inscricaoMunicipal: data.inscricaoMunicipal,
      codigoItemListaServico: data.codigoItemListaServico,
      codigoNbs: data.codigoNbs,
      aliquotaIss: data.aliquotaIss,
      situacaoTributaria: data.situacaoTributaria,
    });
    if (Object.keys(errors).length) throw new Error(Object.values(errors).join(" "));

    const patch: Record<string, unknown> = {};
    if (data.cnpj !== undefined) patch["cnpj"] = normalizeTaxDoc(data.cnpj);
    if (data.inscricaoMunicipal !== undefined) patch["inscricao_municipal"] = data.inscricaoMunicipal || null;
    if (data.razaoSocial !== undefined) patch["razao_social"] = data.razaoSocial || null;
    if (data.codigoItemListaServico !== undefined) patch["codigo_item_lista_servico"] = data.codigoItemListaServico;
    if (data.codigoNbs !== undefined) patch["codigo_nbs"] = data.codigoNbs || null;
    if (data.aliquotaIss !== undefined) patch["aliquota_iss"] = data.aliquotaIss;
    if (data.situacaoTributaria !== undefined) patch["situacao_tributaria"] = data.situacaoTributaria;
    if (data.tributaMunicipioPrestador !== undefined) patch["tributa_municipio_prestador"] = data.tributaMunicipioPrestador;
    if (data.cIndOp !== undefined) patch["ibs_cbs_c_ind_op"] = data.cIndOp;
    if (data.cst !== undefined) patch["ibs_cbs_cst"] = data.cst;
    if (data.cClassTrib !== undefined) patch["ibs_cbs_c_class_trib"] = data.cClassTrib;
    if (data.modoTeste !== undefined) patch["modo_teste"] = data.modoTeste;
    if (data.simplesNacional !== undefined) patch["simples_nacional"] = data.simplesNacional;

    const { data: row, error } = await context.supabase
      .from("nfse_provider_settings")
      .update(patch as never)
      .eq("brand", brand)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapSettings(row as unknown as SettingsRow, Boolean(readSecret(secretNames(brand).senha)));
  });

export const listRentalNfseEmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contractId: string }) => zParse(z.object({ contractId: uuid }), d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("rental_nfse_emissions")
      .select(EMISSION_COLUMNS)
      .eq("contract_id", data.contractId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const list = ((rows ?? []) as unknown as EmissionRow[]).map(mapEmission);
    const ids = [...new Set(list.map((e) => e.resolvedBy).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: profs } = await context.supabase.from("profiles").select("id,nome").in("id", ids);
      const names = new Map(((profs ?? []) as { id: string; nome: string | null }[]).map((p) => [p.id, p.nome]));
      for (const e of list) if (e.resolvedBy) e.resolvedByName = names.get(e.resolvedBy) ?? null;
    }
    return list;
  });

async function hasAdminRole(supabase: AuthedSupabase, userId: string): Promise<boolean> {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return Boolean(data);
}

export const getNfseViewer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({
    isAdmin: await hasAdminRole(context.supabase as unknown as AuthedSupabase, context.userId),
  }));

// ---------------------------------------------------------------------------
// Contexto da emissão (compartilhado entre checagem prévia e envio)
// ---------------------------------------------------------------------------

type ContractRow = {
  id: string;
  brand: string;
  comissao_mensal: number | null;
  proximo_vencimento: string | null;
  rental_tenants: {
    nome: string;
    cpf_cnpj: string | null;
    email: string | null;
    telefone: string | null;
    endereco: string | null;
  } | null;
  rental_properties: {
    apelido: string | null;
    logradouro: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    cep: string | null;
  } | null;
};

export type NfseCheckItem = { key: string; label: string; ok: boolean; level: "bloqueia" | "aviso"; detail?: string };

export type NfsePreview = {
  brand: NfseBrand;
  competencia: string;
  valor: number;
  tomadorNome: string | null;
  tomadorDocumento: string | null;
  identificadorTeste: string;
  identificadorReal: string;
  configModoTeste: boolean;
  checklist: NfseCheckItem[];
  bloqueado: boolean;
  existentes: { id: string; status: EmissionStatus; modoTeste: boolean; createdAt: string }[];
};

async function loadContract(supabase: DbClient, contractId: string): Promise<ContractRow> {
  const { data, error } = await supabase
    .from("rental_contracts")
    .select(
      "id,brand,comissao_mensal,proximo_vencimento,rental_tenants(nome,cpf_cnpj,email,telefone,endereco),rental_properties(apelido,logradouro,numero,complemento,bairro,cidade,cep)",
    )
    .eq("id", contractId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Contrato não encontrado.");
  return data as ContractRow;
}

function buildContext(contract: ContractRow, settingsRow: SettingsRow, competenciaYm: string, modoTeste: boolean) {
  const settings = mapSettings(settingsRow, false);
  const brand = settings.brand;
  const checklist: NfseCheckItem[] = [];
  const add = (key: string, label: string, ok: boolean, level: "bloqueia" | "aviso" = "bloqueia", detail?: string) =>
    checklist.push({ key, label, ok, level, detail });

  add("senha", "Senha do webservice configurada", Boolean(readSecret(secretNames(brand).senha)));
  const settingsErrors = validateNfseSettings({
    cnpj: settings.cnpj,
    inscricaoMunicipal: settings.inscricaoMunicipal,
    codigoItemListaServico: settings.codigoItemListaServico,
    codigoNbs: settings.codigoNbs,
    aliquotaIss: settings.aliquotaIss,
    situacaoTributaria: settings.situacaoTributaria,
    endpointUrl: settingsRow.endpoint_url,
  });
  add("cnpj", "CNPJ do prestador", !settingsErrors["cnpj"], "bloqueia", settingsErrors["cnpj"]);
  add("im", "Inscrição municipal do prestador", !settingsErrors["inscricaoMunicipal"], "bloqueia", settingsErrors["inscricaoMunicipal"]);
  add("item", "Item da lista de serviço", !settingsErrors["codigoItemListaServico"], "bloqueia", settingsErrors["codigoItemListaServico"]);
  add("nbs", "Código NBS", Boolean(settings.codigoNbs) && !settingsErrors["codigoNbs"], "aviso", settingsErrors["codigoNbs"] ?? (settings.codigoNbs ? undefined : "Sem NBS cadastrado."));
  add("aliquota", "Alíquota do ISS", !settingsErrors["aliquotaIss"], "bloqueia", settingsErrors["aliquotaIss"]);
  add("situacao", "Situação tributária", !settingsErrors["situacaoTributaria"], "bloqueia", settingsErrors["situacaoTributaria"]);
  add("endpoint", "Endereço da prefeitura", !settingsErrors["endpointUrl"], "bloqueia", settingsErrors["endpointUrl"]);

  const valor = Number(contract.comissao_mensal ?? 0);
  add("valor", "Comissão mensal maior que zero", valor > 0);

  const tenant = contract.rental_tenants;
  const doc = normalizeTaxDoc(tenant?.cpf_cnpj);
  add("tomador", "Locatário principal", Boolean(tenant));
  add("documento", "CPF/CNPJ do locatário válido", isValidTaxDoc(doc), "bloqueia", doc ? undefined : "Sem documento cadastrado.");

  const imovel = contract.rental_properties;
  const logradouro = imovel?.logradouro?.trim() || tenant?.endereco?.trim() || null;
  const santaRosa = isSantaRosa(imovel?.cidade);
  add("endereco", "Endereço do imóvel", Boolean(logradouro), "aviso", logradouro ? undefined : "Sem logradouro.");
  add("cidade", "Imóvel em Santa Rosa", santaRosa, "aviso", santaRosa ? undefined : "Cidade e CEP do tomador serão omitidos.");

  const emailOk = isValidEmail(tenant?.email);
  add("email", "E-mail do locatário", emailOk, "aviso", emailOk ? undefined : tenant?.email ? "E-mail inválido: será omitido." : "Sem e-mail.");
  const phone = normalizePhone(tenant?.telefone);
  add("telefone", "Telefone do locatário", Boolean(phone), "aviso", phone ? undefined : "Telefone ausente ou inválido: será omitido.");
  add("modo", settings.modoTeste ? "Modo teste ligado na configuração" : "Modo teste desligado na configuração", true, "aviso");

  const mesRef = `${competenciaYm.slice(5, 7)}/${competenciaYm.slice(0, 4)}`;
  const identificador = buildIdentificador(brand, contract.id, competenciaYm, modoTeste);
  const payload: NfsePayload = {
    teste: modoTeste,
    identificador,
    valor,
    descritivo: [
      "Serviço de administração e intermediação de locação de imóvel",
      imovel?.apelido ? `Imóvel: ${imovel.apelido}` : null,
      `Competência ${mesRef}`,
    ]
      .filter(Boolean)
      .join(". "),
    observacao: `Competência ${mesRef}`,
    prestador: { cpfCnpj: settings.cnpj, cidadeTom: settings.cidadeTom },
    tomador: {
      tipo: inferTomadorTipo(doc),
      cpfCnpj: doc,
      nomeRazaoSocial: tenant?.nome ?? "",
      logradouro,
      numeroResidencia: imovel?.logradouro ? (imovel?.numero ?? null) : null,
      complemento: imovel?.logradouro ? (imovel?.complemento ?? null) : null,
      bairro: imovel?.bairro ?? null,
      cidadeTom: santaRosa ? settings.cidadeTom : null,
      cep: santaRosa ? (onlyDigits(imovel?.cep).length === 8 ? onlyDigits(imovel?.cep) : null) : null,
      dddFone: phone?.ddd ?? null,
      fone: phone?.numero ?? null,
      email: emailOk ? (tenant?.email?.trim() ?? null) : null,
    },
    item: {
      codigoLocalPrestacaoServico: settings.cidadeTom,
      codigoItemListaServico: settings.codigoItemListaServico,
      codigoNbs: settings.codigoNbs,
      aliquota: settings.aliquotaIss,
      situacaoTributaria: settings.situacaoTributaria,
      tributaMunicipioPrestador: settings.tributaMunicipioPrestador,
    },
    ibsCbs: settings.simplesNacional
      ? null
      : {
          cLocalidadeIncid: settings.codigoIbgeMunicipio,
          cIndOp: settings.cIndOp,
          cst: settings.cst,
          cClassTrib: settings.cClassTrib,
        },
  };
  const bloqueado = checklist.some((c) => !c.ok && c.level === "bloqueia");
  return { settings, brand, valor, tenant, doc, payload, identificador, checklist, bloqueado };
}

function resolveCompetencia(input: string | null | undefined, contract: ContractRow): string {
  const hoje = currentYmSaoPaulo();
  const comp = input || competenciaFromVencimento(contract.proximo_vencimento, hoje);
  assertCompetenciaPermitida(comp, hoje);
  return comp;
}

export const previewRentalNfse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contractId: string; competencia?: string | null }) =>
    zParse(z.object({ contractId: uuid, competencia: ym.nullish() }), d),
  )
  .handler(async ({ data, context }): Promise<NfsePreview> => {
    await assertFiscalRole(context.supabase as unknown as AuthedSupabase, context.userId);
    const db = context.supabase as unknown as DbClient;
    const contract = await loadContract(db, data.contractId);
    const comp = resolveCompetencia(data.competencia, contract);
    const settingsRow = await loadSettings(db, normalizeNfseBrand(contract.brand));
    const ctx = buildContext(contract, settingsRow, comp, settingsRow.modo_teste);
    const { data: rows, error } = await context.supabase
      .from("rental_nfse_emissions")
      .select("id,status,modo_teste,created_at")
      .eq("contract_id", contract.id)
      .eq("competencia", `${comp}-01`)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return {
      brand: ctx.brand,
      competencia: comp,
      valor: ctx.valor,
      tomadorNome: ctx.tenant?.nome ?? null,
      tomadorDocumento: ctx.doc || null,
      identificadorTeste: buildIdentificador(ctx.brand, contract.id, comp, true),
      identificadorReal: buildIdentificador(ctx.brand, contract.id, comp, false),
      configModoTeste: settingsRow.modo_teste,
      checklist: ctx.checklist,
      bloqueado: ctx.bloqueado,
      existentes: ((rows ?? []) as { id: string; status: string; modo_teste: boolean; created_at: string }[]).map((r) => ({
        id: r.id,
        status: r.status as EmissionStatus,
        modoTeste: r.modo_teste,
        createdAt: r.created_at,
      })),
    };
  });

// ---------------------------------------------------------------------------
// Envio e máquina de estados
// ---------------------------------------------------------------------------

type AdminClient = DbClient;

async function getAdmin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminClient;
}

async function recordEvent(
  admin: AdminClient,
  ev: {
    emissionId: string;
    from: string | null;
    to: string;
    actor: string | null;
    kind: "usuario" | "sistema";
    reason?: string | null;
    details?: Record<string, unknown> | null;
  },
) {
  const { error } = await admin.from("rental_nfse_emission_events").insert({
    emission_id: ev.emissionId,
    from_status: ev.from,
    to_status: ev.to,
    actor: ev.actor,
    actor_kind: ev.kind,
    reason: ev.reason ?? null,
    details: ev.details ?? null,
  });
  if (error) console.error(JSON.stringify({ evento: "nfse_evento_falhou", emissionId: ev.emissionId, erro: error.message }));
}

async function expireStaleProcessing(admin: AdminClient, brand: NfseBrand) {
  const cutoff = new Date(Date.now() - PROCESSANDO_STALE_MS).toISOString();
  const { data: expired, error } = await admin
    .from("rental_nfse_emissions")
    .update({
      status: "incerto",
      error_message: "Envio sem resposta registrada: confira na prefeitura antes de emitir de novo.",
      updated_at: new Date().toISOString(),
    })
    .eq("brand", brand)
    .eq("status", "processando")
    .lt("updated_at", cutoff)
    .select("id");
  if (error) throw new Error(error.message);
  for (const r of (expired ?? []) as { id: string }[])
    await recordEvent(admin, { emissionId: r.id, from: "processando", to: "incerto", actor: null, kind: "sistema", reason: "processando_vencido" });
}

function uniqueViolationMessage(err: { code?: string; message?: string }): string | null {
  if (err.code !== "23505") return null;
  if ((err.message ?? "").includes("rental_nfse_brand_processando_uniq"))
    return "Outra emissão desta marca está em andamento, aguarde.";
  return "Já existe nota emitida, em processamento ou incerta para esta competência.";
}

function logAttempt(fields: Record<string, unknown>, isError: boolean) {
  const line = JSON.stringify({ evento: "nfse_emissao", ...fields });
  if (isError) console.error(line);
  else console.info(line);
}

async function sendAndRecord(opts: {
  admin: AdminClient;
  emissionId: string;
  brand: NfseBrand;
  contractId: string;
  identificador: string;
  modoTeste: boolean;
  settingsRow: SettingsRow;
  xml: string;
  actor: string;
  origem: "emissao" | "conferencia";
}) {
  const { admin, emissionId, brand, settingsRow } = opts;
  const names = secretNames(brand);
  const senha = readSecret(names.senha) as string;
  const login = readSecret(names.login) ?? onlyDigits(settingsRow.cnpj, 14);
  const { postNfse } = await import("./ipm/client.server");
  const result = await postNfse({
    endpointUrl: settingsRow.endpoint_url,
    login,
    senha,
    cidade: settingsRow.cidade_tom,
    xml: opts.xml,
  });
  const p = result.parsed;
  const status: EmissionStatus =
    result.transport !== "ok" ? "incerto" : classifyResult(p, result.httpStatus ?? 0, opts.modoTeste);

  const errorMessage =
    status === "teste_ok" || status === "emitida"
      ? p.mensagens.length && status === "emitida"
        ? `Aviso da prefeitura: ${p.mensagem}`
        : null
      : [
          result.transportError,
          p.mensagem,
          status === "incerto" && result.transport === "ok" ? "Retorno não reconhecido: confira na prefeitura." : null,
          result.httpStatus ? `HTTP ${result.httpStatus}` : null,
        ]
          .filter(Boolean)
          .join(" — ");

  const now = new Date().toISOString();
  const real = !opts.modoTeste;
  const { data: updated, error } = await admin
    .from("rental_nfse_emissions")
    .update({
      status,
      http_status: result.httpStatus,
      duration_ms: result.durationMs,
      error_codes: p.codigosErro.length ? p.codigosErro : null,
      error_message: errorMessage,
      numero_nfse: real ? p.numeroNfse : null,
      serie_nfse: real ? p.serieNfse : null,
      codigo_verificador: real ? p.codigoVerificador : null,
      link_pdf: real ? p.linkPdf : null,
      data_emissao_nfse: real && p.dataNfse ? [p.dataNfse, p.horaNfse].filter(Boolean).join(" ") : null,
      situacao_nfse: real ? (p.situacaoDescricao ?? p.situacaoCodigo) : null,
      response_raw: result.raw.slice(0, 20000) || null,
      finished_at: now,
      updated_at: now,
    })
    .eq("id", emissionId)
    .select(EMISSION_COLUMNS)
    .single();

  logAttempt(
    {
      brand,
      contractId: opts.contractId,
      identificador: opts.identificador,
      status,
      http_status: result.httpStatus,
      duration_ms: result.durationMs,
      error_codes: p.codigosErro,
    },
    status === "erro" || status === "incerto" || Boolean(error),
  );
  await recordEvent(admin, {
    emissionId,
    from: "processando",
    to: status,
    actor: opts.actor,
    kind: "usuario",
    reason: opts.origem,
    details: { http_status: result.httpStatus, duration_ms: result.durationMs, error_codes: p.codigosErro, transport: result.transport },
  });
  if (error) throw new Error(`Resposta recebida, mas o registro falhou: ${error.message}. A linha ficou em processamento e será conferida.`);

  const message =
    status === "teste_ok"
      ? "NFS-e válida para emissão (modo teste, sem valor fiscal)."
      : status === "emitida"
        ? "NFS-e emitida com sucesso."
        : status === "incerto"
          ? "Não houve resposta confirmada da prefeitura. A nota ficou aguardando conferência."
          : (errorMessage ?? "A prefeitura recusou a nota.");
  return { emission: mapEmission(updated as EmissionRow), message };
}

const emitSchema = z.object({
  contractId: uuid,
  modoTeste: z.boolean().optional(),
  confirmarEmissaoReal: z.boolean().optional(),
  competencia: ym.nullish(),
});

export const emitRentalNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof emitSchema>) => zParse(emitSchema, d))
  .handler(async ({ data, context }) => {
    await assertFiscalRole(context.supabase as unknown as AuthedSupabase, context.userId);
    const db = context.supabase as unknown as DbClient;
    const contract = await loadContract(db, data.contractId);
    const comp = resolveCompetencia(data.competencia, contract);
    const brand = normalizeNfseBrand(contract.brand);
    const settingsRow = await loadSettings(db, brand);

    // Trava: a configuração manda. Lança antes de qualquer escrita ou envio.
    const modoTeste = resolveModoTeste({
      configModoTeste: settingsRow.modo_teste,
      pedidoModoTeste: data.modoTeste,
      confirmarEmissaoReal: data.confirmarEmissaoReal,
    });

    const ctx = buildContext(contract, settingsRow, comp, modoTeste);
    if (!isAllowedEndpoint(settingsRow.endpoint_url)) throw new Error("Endereço da prefeitura fora da lista permitida.");
    if (ctx.bloqueado) {
      const pend = ctx.checklist.filter((c) => !c.ok && c.level === "bloqueia").map((c) => c.detail ?? c.label);
      throw new Error(`Emissão bloqueada: ${pend.join("; ")}.`);
    }
    const xml = buildNfseXml(ctx.payload);

    const admin = await getAdmin();
    await expireStaleProcessing(admin, brand);
    const { data: inserted, error: insertError } = await admin
      .from("rental_nfse_emissions")
      .insert({
        contract_id: contract.id,
        brand,
        competencia: `${comp}-01`,
        valor: ctx.valor,
        modo_teste: modoTeste,
        status: "processando",
        request_xml: xml,
        identificador: ctx.identificador,
        created_by: context.userId,
        confirmacao_real_por: modoTeste ? null : context.userId,
      })
      .select("id")
      .single();
    if (insertError) {
      const msg = uniqueViolationMessage(insertError);
      throw new Error(msg ?? insertError.message);
    }

    await recordEvent(admin, {
      emissionId: (inserted as { id: string }).id,
      from: null,
      to: "processando",
      actor: context.userId,
      kind: "usuario",
      reason: modoTeste ? "emissao_teste" : "emissao_real",
      details: { identificador: ctx.identificador, competencia: comp },
    });
    return sendAndRecord({
      actor: context.userId,
      origem: "emissao",
      admin,
      emissionId: (inserted as { id: string }).id,
      brand,
      contractId: contract.id,
      identificador: ctx.identificador,
      modoTeste,
      settingsRow,
      xml,
    });
  });

export const reconcileRentalNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { emissionId: string }) => zParse(z.object({ emissionId: uuid }), d))
  .handler(async ({ data, context }) => {
    await assertFiscalRole(context.supabase as unknown as AuthedSupabase, context.userId);
    // Leitura com o cliente do usuário: a RLS de acesso ao contrato vale.
    const { data: rowRaw, error } = await context.supabase
      .from("rental_nfse_emissions")
      .select(`${EMISSION_COLUMNS},request_xml`)
      .eq("id", data.emissionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!rowRaw) throw new Error("Emissão não encontrada.");
    const row = rowRaw as unknown as EmissionRow;
    const brand = normalizeNfseBrand(row.brand);
    const admin = await getAdmin();
    await expireStaleProcessing(admin, brand);

    const { data: fresh, error: freshErr } = await admin
      .from("rental_nfse_emissions")
      .select("status,attempts,request_xml,identificador")
      .eq("id", row.id)
      .single();
    if (freshErr) throw new Error(freshErr.message);
    const f = fresh as { status: string; attempts: number | null; request_xml: string | null; identificador: string | null };
    if (f.status !== "incerto") throw new Error("Só emissões aguardando conferência podem ser conferidas.");
    if (!f.request_xml || !f.identificador)
      throw new Error("Emissão antiga sem identificador: não é possível conferir automaticamente.");

    const settingsRow = await loadSettings(admin, brand);
    if (!isAllowedEndpoint(settingsRow.endpoint_url)) throw new Error("Endereço da prefeitura fora da lista permitida.");
    if (!readSecret(secretNames(brand).senha)) throw new Error("Senha do webservice não configurada.");

    const { data: claimed, error: claimErr } = await admin
      .from("rental_nfse_emissions")
      .update({ status: "processando", attempts: (f.attempts ?? 1) + 1, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "incerto")
      .select("id");
    if (claimErr) throw new Error(uniqueViolationMessage(claimErr) ?? claimErr.message);
    if (!claimed || (claimed as unknown[]).length === 0) throw new Error("Esta emissão já está sendo conferida.");

    await recordEvent(admin, {
      emissionId: row.id,
      from: "incerto",
      to: "processando",
      actor: context.userId,
      kind: "usuario",
      reason: "conferencia",
      details: { attempts: (f.attempts ?? 1) + 1 },
    });
    return sendAndRecord({
      actor: context.userId,
      origem: "conferencia",
      admin,
      emissionId: row.id,
      brand,
      contractId: row.contract_id,
      identificador: f.identificador,
      modoTeste: row.modo_teste,
      settingsRow,
      xml: f.request_xml,
    });
  });

export type NfseBrandHealth = {
  brand: NfseBrand;
  ultima: { status: EmissionStatus; modoTeste: boolean; createdAt: string; mensagem: string | null } | null;
  ultimoSucessoReal: string | null;
  incerto30d: number;
  erro30d: number;
  naoEmitida30d: number;
};

export const getNfseHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NfseBrandHealth[]> => {
    await assertFiscalRole(context.supabase as unknown as AuthedSupabase, context.userId);
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const out: NfseBrandHealth[] = [];
    for (const brand of ["cordial", "morar"] as const) {
      const [last, okReal, recent] = await Promise.all([
        context.supabase
          .from("rental_nfse_emissions")
          .select("status,modo_teste,created_at,error_message")
          .eq("brand", brand)
          .order("created_at", { ascending: false })
          .limit(1),
        context.supabase
          .from("rental_nfse_emissions")
          .select("created_at")
          .eq("brand", brand)
          .eq("status", "emitida")
          .eq("modo_teste", false)
          .order("created_at", { ascending: false })
          .limit(1),
        context.supabase
          .from("rental_nfse_emissions")
          .select("status")
          .eq("brand", brand)
          .in("status", ["incerto", "erro", "nao_emitida"])
          .gte("created_at", since),
      ]);
      for (const r of [last, okReal, recent]) if (r.error) throw new Error(r.error.message);
      const l = (last.data ?? [])[0] as { status: string; modo_teste: boolean; created_at: string; error_message: string | null } | undefined;
      const rs = (recent.data ?? []) as { status: string }[];
      out.push({
        brand,
        ultima: l ? { status: l.status as EmissionStatus, modoTeste: l.modo_teste, createdAt: l.created_at, mensagem: l.error_message } : null,
        ultimoSucessoReal: ((okReal.data ?? [])[0] as { created_at: string } | undefined)?.created_at ?? null,
        incerto30d: rs.filter((r) => r.status === "incerto").length,
        erro30d: rs.filter((r) => r.status === "erro").length,
        naoEmitida30d: rs.filter((r) => r.status === "nao_emitida").length,
      });
    }
    return out;
  });

const markSchema = z.object({
  emissionId: uuid,
  reason: z.string().max(1000),
  conferidoNoPortal: z.boolean(),
});

export const markRentalNfseNotIssued = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof markSchema>) => zParse(markSchema, d))
  .handler(async ({ data, context }) => {
    const isAdmin = await hasAdminRole(context.supabase as unknown as AuthedSupabase, context.userId);
    if (!isAdmin) throw new Error("Apenas a administração pode marcar uma nota como não emitida.");
    const { data: visible, error: visErr } = await context.supabase
      .from("rental_nfse_emissions")
      .select("id,brand")
      .eq("id", data.emissionId)
      .maybeSingle();
    if (visErr) throw new Error(visErr.message);
    if (!visible) throw new Error("Emissão não encontrada.");
    const admin = await getAdmin();
    await expireStaleProcessing(admin, normalizeNfseBrand((visible as { brand: string }).brand));
    const { data: fresh, error: fErr } = await admin
      .from("rental_nfse_emissions")
      .select("status,numero_nfse")
      .eq("id", data.emissionId)
      .single();
    if (fErr) throw new Error(fErr.message);
    const f = fresh as { status: string; numero_nfse: string | null };
    const reason = data.reason.trim();
    const refusal = checkMarkNotIssued({ isAdmin, status: f.status, numeroNfse: f.numero_nfse, reason, conferidoNoPortal: data.conferidoNoPortal });
    if (refusal) throw new Error(refusal);
    const now = new Date().toISOString();
    const { data: upd, error: uErr } = await admin
      .from("rental_nfse_emissions")
      .update({ status: "nao_emitida", resolved_by: context.userId, resolved_at: now, resolution_reason: reason, updated_at: now })
      .eq("id", data.emissionId)
      .eq("status", "incerto")
      .is("numero_nfse", null)
      .select(EMISSION_COLUMNS);
    if (uErr) throw new Error(uErr.message);
    const rows = (upd ?? []) as EmissionRow[];
    if (!rows.length) throw new Error("A emissão mudou de estado: atualize a tela e confira de novo.");
    await recordEvent(admin, {
      emissionId: data.emissionId,
      from: "incerto",
      to: "nao_emitida",
      actor: context.userId,
      kind: "usuario",
      reason,
      details: { conferido_no_portal: true },
    });
    return { emission: mapEmission(rows[0] as EmissionRow), message: "Marcada como não emitida. A competência está livre." };
  });

export const reclassifyStuckNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isAdmin = await hasAdminRole(context.supabase as unknown as AuthedSupabase, context.userId);
    if (!isAdmin) throw new Error("Apenas a administração pode reclassificar pendências.");
    const admin = await getAdmin();
    for (const b of ["cordial", "morar"] as const) await expireStaleProcessing(admin, b);
    const { data: rows, error } = await admin
      .from("rental_nfse_emissions")
      .select("id,status,modo_teste,response_raw")
      .eq("status", "incerto");
    if (error) throw new Error(error.message);
    const { parseNfseResponse } = await import("./ipm/response");
    let analisadas = 0;
    let semRetorno = 0;
    const alteradas: { id: string; de: string; para: string }[] = [];
    for (const r of (rows ?? []) as { id: string; status: string; modo_teste: boolean; response_raw: string | null }[]) {
      analisadas++;
      if (!r.response_raw) {
        semRetorno++;
        continue;
      }
      const next = reclassifyFromRaw(r.status, r.response_raw, r.modo_teste, parseNfseResponse);
      if (!next) continue;
      const p = parseNfseResponse(r.response_raw);
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        status: next,
        error_codes: p.codigosErro.length ? p.codigosErro : null,
        updated_at: now,
      };
      if (next === "erro") patch["error_message"] = p.mensagem;
      if (next === "emitida") {
        Object.assign(patch, {
          numero_nfse: p.numeroNfse,
          serie_nfse: p.serieNfse,
          codigo_verificador: p.codigoVerificador,
          link_pdf: p.linkPdf,
          situacao_nfse: p.situacaoDescricao ?? p.situacaoCodigo,
          error_message: p.mensagens.length ? `Aviso da prefeitura: ${p.mensagem}` : null,
        });
      }
      const { data: upd, error: uErr } = await admin
        .from("rental_nfse_emissions")
        .update(patch)
        .eq("id", r.id)
        .eq("status", r.status)
        .select("id");
      if (uErr) throw new Error(uErr.message);
      if (!(upd ?? []).length) continue;
      await recordEvent(admin, {
        emissionId: r.id,
        from: r.status,
        to: next,
        actor: context.userId,
        kind: "sistema",
        reason: "reclassificacao_parser",
        details: { status_antigo: r.status, motivo: p.kind, error_codes: p.codigosErro },
      });
      alteradas.push({ id: r.id, de: r.status, para: next });
    }
    return { analisadas, semRetorno, alteradas };
  });
