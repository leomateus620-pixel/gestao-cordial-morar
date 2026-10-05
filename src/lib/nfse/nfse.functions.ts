import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildNfseXml, buildNfseConsultXml, inferTomadorTipo, type NfsePayload } from "./ipm/xml";
import { safeNfseDocumentUrl } from "./ipm/response";
import {
  assertCompetenciaPermitida,
  buildIdentificador,
  classifyResult,
  currentYmSaoPaulo,
  checkMarkNotIssued,
  PROCESSANDO_STALE_MS,
  reclassifyFromRaw,
  resolveModoTeste,
  type EmissionStatus,
} from "./emission-rules";
import {
  isAllowedEndpoint,
  isValidTaxDoc,
  normalizeTaxDoc,
  validateNfseSettings,
} from "./validation";
import {
  fiscalProfileSchema,
  fiscalReviewSchema,
  readFiscalProfile,
  resolveIssuer,
  type FiscalProfile,
  type FiscalReview,
} from "./fiscal-profile";
export type { FiscalProfile, FiscalReview } from "./fiscal-profile";

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
  senhaConfigurada: boolean;
  fiscalProfile: FiscalProfile | null;
  configVersion: number;
  configurationComplete: boolean;
  validatedInTest: boolean;
  productionEnabled: boolean;
};
export type NfseEmission = {
  id: string;
  contractId: string;
  brand: string;
  competencia: string;
  valor: number;
  status: EmissionStatus;
  modoTeste: boolean;
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
  dataEmissao: string | null;
  canConsult: boolean;
  failureStage?: "antes_envio" | "recusa" | null;
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
  fiscal_profile?: unknown;
  config_version?: number;
  fiscal_approved_config_version?: number | null;
  production_authorized_config_version?: number | null;
};
type EmissionRow = {
  id: string;
  contract_id: string;
  brand: string;
  competencia: string;
  valor: number | string;
  status: EmissionStatus;
  modo_teste: boolean;
  numero_nfse: string | null;
  serie_nfse: string | null;
  codigo_verificador: string | null;
  link_pdf: string | null;
  identificador: string | null;
  attempts: number | null;
  created_at: string;
  updated_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_reason: string | null;
  data_emissao_nfse: string | null;
  request_xml?: string | null;
  response_raw?: string | null;
  snapshot?: FiscalSnapshot | null;
  snapshot_hash?: string | null;
  issuer_identity?: string | null;
  config_version?: number | null;
  attempt_id?: string | null;
  http_status?: number | null;
  response_complete?: boolean;
  parser_version?: string | null;
  transport?: string | null;
  transition_details?: { mode?: string; previous_status?: EmissionStatus } | null;
};
// Column privileges in the proposed migration match this operational projection. No XML/raw/error/HTTP in browser DTOs.
const EMISSION_COLUMNS =
  "id,contract_id,brand,competencia,valor,status,modo_teste,numero_nfse,serie_nfse,codigo_verificador,link_pdf,identificador,attempts,created_at,updated_at,resolved_by,resolved_at,resolution_reason,data_emissao_nfse";
const STATUSES: EmissionStatus[] = [
  "teste_ok",
  "emitida",
  "erro",
  "cancelada",
  "processando",
  "incerto",
  "nao_emitida",
];
// Supabase generated types predate the proposed migration; writes remain confined to these server functions.
type DbClient = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type AuthedSupabase = {
  rpc: (
    fn: "has_role",
    args: { _user_id: string; _role: "admin" | "financeiro" },
  ) => PromiseLike<{ data: unknown; error?: unknown }>;
};
const uuid = z.string().uuid();
const ym = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe a competência (AAAA-MM).");
const brandSchema = z.enum(["cordial", "morar"]);
function zParse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value ?? {});
  if (!result.success)
    throw new Error(
      result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    );
  return result.data;
}
function dbFailure(error: unknown, reference?: string): never {
  // Logs carry only an operational reference, never SQL, XML, provider bodies, headers or credentials.
  console.error(
    JSON.stringify({
      evento: "nfse_persistencia_pendente",
      referencia: reference ?? "configuracao",
    }),
  );
  throw new Error(
    `Não foi possível confirmar o registro fiscal. Atualize e tente consultar novamente. Referência: ${reference ?? "configuração fiscal"}.`,
  );
}
export function normalizeNfseBrand(brand: string | null | undefined): NfseBrand {
  return resolveIssuer(String(brand ?? ""));
}
function secretNames(brand: NfseBrand) {
  const suffix = brand.toUpperCase();
  return { login: `IPM_NFSE_LOGIN_${suffix}`, senha: `IPM_NFSE_SENHA_${suffix}` };
}
function readSecret(name: string): string | null {
  const value = process.env[name];
  return value?.trim() ? value : null;
}
async function hasAdminRole(db: AuthedSupabase, userId: string) {
  const result = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  return !result.error && result.data === true;
}
async function fiscalRole(db: AuthedSupabase, userId: string) {
  const [admin, financial] = await Promise.all([
    db.rpc("has_role", { _user_id: userId, _role: "admin" }),
    db.rpc("has_role", { _user_id: userId, _role: "financeiro" }),
  ]);
  return (!admin.error && admin.data === true) || (!financial.error && financial.data === true);
}
async function assertFiscalRole(db: AuthedSupabase, userId: string) {
  if (!(await fiscalRole(db, userId)))
    throw new Error("Apenas a administração ou o financeiro podem acessar a operação fiscal.");
}
async function getAdmin(): Promise<DbClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DbClient;
}
async function loadSettings(db: DbClient, brand: NfseBrand): Promise<SettingsRow> {
  const { data, error } = await db
    .from("nfse_provider_settings")
    .select("*")
    .eq("brand", brand)
    .maybeSingle();
  if (error) dbFailure(error);
  if (!data) throw new Error("Configuração fiscal não encontrada para esta empresa.");
  return data as SettingsRow;
}
function settingsErrors(row: SettingsRow) {
  const errors = validateNfseSettings({
    cnpj: row.cnpj,
    inscricaoMunicipal: row.inscricao_municipal,
    codigoItemListaServico: row.codigo_item_lista_servico,
    codigoNbs: row.codigo_nbs,
    aliquotaIss: Number(row.aliquota_iss),
    situacaoTributaria: row.situacao_tributaria,
    endpointUrl: row.endpoint_url,
  });
  const profile = readFiscalProfile(row.fiscal_profile, row.cidade_tom);
  if (!/^\d{4,9}$/.test(row.cidade_tom) || !/^\d{7}$/.test(row.codigo_ibge_municipio))
    errors.municipio = "Revise os códigos oficiais do município do prestador.";
  if (
    profile?.layout === "122/2025" &&
    !/^\d{9}$/.test(String(row.codigo_nbs ?? "").replace(/[.\s]/g, ""))
  )
    errors.codigoNbs = "Informe o NBS aprovado de nove dígitos para este layout.";
  if (profile?.ibsCbs) {
    if (
      !/^\d{6}$/.test(row.ibs_cbs_c_ind_op) ||
      !/^\d{3}$/.test(row.ibs_cbs_cst) ||
      !/^\d{6}$/.test(row.ibs_cbs_c_class_trib) ||
      profile.finNFSe === null ||
      profile.indFinal === null
    )
      errors.ibsCbs =
        "Complete os códigos, finalidade e indicador final do IBS/CBS conforme aprovação.";
    const requiresTp = ["2505", "1509", "1712", "1005"].includes(
      row.codigo_item_lista_servico.replace(/\D/g, "").slice(0, 4),
    );
    if (requiresTp !== Boolean(profile.tpOper))
      errors.tpOper = "Revise o tipo da operação conforme o serviço aprovado.";
  }
  return errors;
}
function mapSettings(row: SettingsRow, validatedInTest = false): NfseSettings {
  const brand = normalizeNfseBrand(row.brand);
  const fiscalProfile = readFiscalProfile(row.fiscal_profile, row.cidade_tom);
  const senhaConfigurada = Boolean(readSecret(secretNames(brand).senha));
  const configurationComplete =
    !!fiscalProfile &&
    !!row.config_version &&
    senhaConfigurada &&
    !Object.keys(settingsErrors(row)).length;
  return {
    brand,
    cnpj: row.cnpj,
    inscricaoMunicipal: row.inscricao_municipal,
    razaoSocial: row.razao_social,
    cidadeTom: row.cidade_tom,
    codigoIbgeMunicipio: row.codigo_ibge_municipio,
    codigoItemListaServico: row.codigo_item_lista_servico,
    codigoNbs: row.codigo_nbs,
    aliquotaIss: Number(row.aliquota_iss),
    situacaoTributaria: row.situacao_tributaria,
    tributaMunicipioPrestador: row.tributa_municipio_prestador === "N" ? "N" : "S",
    cIndOp: row.ibs_cbs_c_ind_op,
    cst: row.ibs_cbs_cst,
    cClassTrib: row.ibs_cbs_c_class_trib,
    modoTeste: row.modo_teste,
    simplesNacional: row.simples_nacional,
    senhaConfigurada,
    fiscalProfile,
    configVersion: row.config_version ?? 0,
    configurationComplete,
    validatedInTest,
    productionEnabled:
      configurationComplete &&
      validatedInTest &&
      !row.modo_teste &&
      !!fiscalProfile,
  };
}
async function testedConfig(db: DbClient, row: SettingsRow): Promise<boolean> {
  if (!row.config_version) return false;
  const result = await db
    .from("rental_nfse_emissions")
    .select("id")
    .eq("brand", row.brand)
    .eq("config_version", row.config_version)
    .eq("status", "teste_ok")
    .eq("modo_teste", true)
    .limit(1);
  if (result.error) dbFailure(result.error);
  return !!result.data?.length;
}
function safeMessage(status: EmissionStatus, id: string, transport?: string | null): string | null {
  if (status === "erro" && transport === "nao_enviado")
    return `O envio não foi iniciado. Revise a configuração fiscal antes de tentar a mesma operação. Referência: ${id}.`;
  if (status === "erro")
    return `A operação foi recusada ou impedida. Confira os dados com a operação fiscal; correções exigem uma prévia revisada. Referência: ${id}.`;
  if (status === "incerto")
    return "A emissão ainda não foi esclarecida. Consulte a prefeitura antes de qualquer novo envio.";
  return null;
}
function mapEmission(row: EmissionRow): NfseEmission {
  const status = STATUSES.includes(row.status) ? row.status : "incerto";
  return {
    id: row.id,
    contractId: row.contract_id,
    brand: row.brand,
    competencia: row.competencia,
    valor: Number(row.valor),
    status,
    modoTeste: row.modo_teste,
    numeroNfse: row.modo_teste ? null : row.numero_nfse,
    serieNfse: row.modo_teste ? null : row.serie_nfse,
    codigoVerificador: row.modo_teste ? null : row.codigo_verificador,
    linkPdf: row.modo_teste ? null : safeNfseDocumentUrl(row.link_pdf),
    errorMessage: safeMessage(status, row.id, row.transport),
    errorCodes: [],
    identificador: row.identificador,
    httpStatus: null,
    durationMs: null,
    attempts: row.attempts ?? 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedBy: row.resolved_by,
    resolvedByName: null,
    resolvedAt: row.resolved_at,
    resolutionReason: row.resolution_reason,
    dataEmissao: row.modo_teste ? null : row.data_emissao_nfse,
    canConsult: !row.modo_teste && !!row.codigo_verificador,
    failureStage:
      status === "erro"
        ? row.transport === "nao_enviado"
          ? "antes_envio"
          : row.transport === "ok"
            ? "recusa"
            : null
        : null,
  };
}

export const getNfseViewer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({
    isAdmin: await hasAdminRole(context.supabase as unknown as AuthedSupabase, context.userId),
    canEmit: await fiscalRole(context.supabase as unknown as AuthedSupabase, context.userId),
  }));
export const getNfseSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand?: string } | undefined) =>
    zParse(z.object({ brand: brandSchema }), d),
  )
  .handler(async ({ data, context }) => {
    await assertFiscalRole(context.supabase as unknown as AuthedSupabase, context.userId);
    const row = await loadSettings(context.supabase as unknown as DbClient, data.brand);
    return mapSettings(row, await testedConfig(await getAdmin(), row));
  });
const saveSchema = z.object({
  brand: brandSchema,
  cnpj: z.string().max(30).optional(),
  inscricaoMunicipal: z.string().max(30).nullable().optional(),
  razaoSocial: z.string().max(150).nullable().optional(),
  codigoItemListaServico: z.string().max(20).optional(),
  codigoNbs: z.string().max(20).nullable().optional(),
  aliquotaIss: z.number().finite().optional(),
  situacaoTributaria: z.string().max(10).optional(),
  tributaMunicipioPrestador: z.enum(["S", "N"]).optional(),
  cIndOp: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  cst: z
    .string()
    .regex(/^\d{3}$/)
    .optional(),
  cClassTrib: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  modoTeste: z.boolean().optional(),
  simplesNacional: z.boolean().optional(),
  fiscalProfile: fiscalProfileSchema.nullable().optional(),
  aprovarPerfil: z.boolean().optional(),
});
export const saveNfseSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof saveSchema>) => zParse(saveSchema, d))
  .handler(async ({ data, context }) => {
    await assertFiscalRole(context.supabase as unknown as AuthedSupabase, context.userId);
    const db = context.supabase as unknown as DbClient;
    const current = await loadSettings(db, data.brand);
    if (data.fiscalProfile !== undefined && data.aprovarPerfil !== true)
      throw new Error(
        "Confirme explicitamente que a aprovação contábil cobre esta configuração antes de registrar o perfil.",
      );
    const patch: Record<string, unknown> = {};
    const mapping = {
      cnpj: "cnpj",
      inscricaoMunicipal: "inscricao_municipal",
      razaoSocial: "razao_social",
      codigoItemListaServico: "codigo_item_lista_servico",
      codigoNbs: "codigo_nbs",
      aliquotaIss: "aliquota_iss",
      situacaoTributaria: "situacao_tributaria",
      tributaMunicipioPrestador: "tributa_municipio_prestador",
      cIndOp: "ibs_cbs_c_ind_op",
      cst: "ibs_cbs_cst",
      cClassTrib: "ibs_cbs_c_class_trib",
      modoTeste: "modo_teste",
      simplesNacional: "simples_nacional",
      fiscalProfile: "fiscal_profile",
    } as const;
    for (const [key, column] of Object.entries(mapping)) {
      const value = data[key as keyof typeof mapping];
      if (value !== undefined)
        patch[column] =
          key === "cnpj"
            ? normalizeTaxDoc(value as string)
            : key === "fiscalProfile" && value === null
              ? {}
              : value;
    }
    const merged = { ...current, ...patch } as SettingsRow;
    const errors = settingsErrors(merged);
    if (Object.keys(errors).length) throw new Error(Object.values(errors).join(" "));
    if (
      data.fiscalProfile !== undefined ||
      (data.modoTeste !== undefined && data.modoTeste !== current.modo_teste)
    ) {
      if (!(await hasAdminRole(context.supabase as unknown as AuthedSupabase, context.userId)))
        throw new Error(
          "A administração deve registrar a aprovação fiscal e a autorização de produção.",
        );
    }
    const { canonicalJson } = await import("./fiscal-profile");
    const material = Object.entries(patch).some(
      ([key, value]) =>
        key !== "modo_teste" &&
        canonicalJson(value) !== canonicalJson(current[key as keyof SettingsRow]),
    );
    if (!merged.modo_teste && (!material || data.modoTeste === false)) {
      // A fiscal change must first be saved and tested. Changing the mode alone does not change the fiscal version.
      if (material || !(await testedConfig(await getAdmin(), current)))
        throw new Error(
          "Salve as alterações em modo teste e valide esta versão antes de habilitar produção.",
        );
    }
    const result = await db
      .from("nfse_provider_settings")
      .update(patch)
      .eq("brand", data.brand)
      .eq("config_version", current.config_version)
      .select("*")
      .single();
    if (result.error) dbFailure(result.error);
    return mapSettings(
      result.data as SettingsRow,
      await testedConfig(await getAdmin(), result.data as SettingsRow),
    );
  });

type ContractRow = {
  id: string;
  brand: string;
  updated_at: string;
  valor_mensal: number;
  comissao_mensal: number | null;
};
async function loadContract(db: DbClient, id: string): Promise<ContractRow> {
  const result = await db
    .from("rental_contracts")
    .select("id,brand,updated_at,valor_mensal,comissao_mensal")
    .eq("id", id)
    .maybeSingle();
  if (result.error) dbFailure(result.error, id);
  if (!result.data) throw new Error("Contrato não encontrado ou sem permissão de acesso.");
  return result.data as ContractRow;
}
type ServiceReference = {
  id: string;
  contract_id: string;
  source: string;
  source_key: string;
  vencimento_original: string | null;
  competencia: string | null;
  fato_gerador: string | null;
  valor_servico: number | null;
  contract_snapshot: unknown;
  decision: unknown;
  created_at: string;
};
type FiscalSnapshot = {
  version: 1;
  contractId: string;
  contractRevision: string;
  brand: NfseBrand;
  issuerIdentity: string;
  configVersion: number;
  fiscalSettings: Record<string, unknown>;
  profile: FiscalProfile;
  competencia: string;
  review: FiscalReview;
  reference: ServiceReference | null;
  payload: NfsePayload;
  revisionOf: {
    id: string;
    attemptId: string | null;
    updatedAt: string | null;
    snapshotHash: string | null;
    identificador: string | null;
  } | null;
};
export type NfseCheckItem = {
  key: string;
  label: string;
  ok: boolean;
  level: "bloqueia" | "aviso";
  detail?: string;
};
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
  previewToken: string | null;
  serviceDescription: string;
  prestadorNome: string | null;
  prestadorDocumento: string;
  dataFatoGerador: string | null;
  sourceDescription: string;
  profile: FiscalProfile | null;
  requiresProperty: boolean;
  references: {
    id: string;
    source: string;
    vencimentoOriginal: string | null;
    valorServico: number | null;
    createdAt: string;
  }[];
};
const previewSchema = z.object({
  contractId: uuid,
  competencia: ym,
  emissor: brandSchema.optional(),
  modoTeste: z.boolean().optional(),
  review: fiscalReviewSchema.optional(),
});
function fiscalSettings(row: SettingsRow): Record<string, unknown> {
  const { modo_teste: _mode, fiscal_profile: _profile, config_version: _version, ...fields } = row;
  // Explicit allowlist: never add arbitrary DB columns (secrets, metadata) to the signed snapshot.
  return Object.fromEntries(
    [
      "brand",
      "cnpj",
      "inscricao_municipal",
      "razao_social",
      "cidade_tom",
      "codigo_ibge_municipio",
      "endpoint_url",
      "codigo_item_lista_servico",
      "codigo_nbs",
      "aliquota_iss",
      "situacao_tributaria",
      "tributa_municipio_prestador",
      "ibs_cbs_c_ind_op",
      "ibs_cbs_cst",
      "ibs_cbs_c_class_trib",
      "simples_nacional",
    ].map((key) => [key, fields[key as keyof typeof fields]]),
  );
}
function identity(
  issuer: string,
  operation: string,
  contractId: string,
  competencia: string,
  teste: boolean,
) {
  return buildIdentificador(
    `${issuer}-${operation === "administracao" ? "ADM" : "INT"}`,
    contractId,
    competencia,
    teste,
  );
}
async function prepare(db: DbClient, input: z.infer<typeof previewSchema>) {
  const contract = await loadContract(db, input.contractId);
  const brand = resolveIssuer(contract.brand, input.emissor);
  assertCompetenciaPermitida(input.competencia, currentYmSaoPaulo());
  const row = await loadSettings(db, brand);
  const profile = readFiscalProfile(row.fiscal_profile, row.cidade_tom);
  const admin = await getAdmin();
  const checks: NfseCheckItem[] = [];
  const add = (key: string, label: string, ok: boolean, detail?: string) =>
    checks.push({ key, label, ok, detail, level: "bloqueia" });
  add(
    "persistence",
    "Persistência fiscal preparada",
    !!row.config_version,
    "A atualização transacional do banco precisa estar aplicada e verificada pela operação interna.",
  );
  const errors = settingsErrors(row);
  for (const [key, detail] of Object.entries(errors))
    add(key, "Corrigir configuração fiscal", false, detail);
  const senha = readSecret(secretNames(brand).senha);
  add(
    "credentials",
    "Credenciais cadastradas",
    !!senha,
    "Cadastre a credencial do emissor no servidor.",
  );
  const login = normalizeTaxDoc(readSecret(secretNames(brand).login) ?? row.cnpj);
  add(
    "identity",
    "Credencial corresponde ao prestador",
    login === normalizeTaxDoc(row.cnpj),
    "A credencial deve pertencer ao CPF/CNPJ do prestador.",
  );
  const review = input.review;
  add(
    "review",
    "Referência do serviço revisada",
    !!review,
    "Informe competência, fato gerador, valor e endereço fiscal do tomador; registre a origem da decisão.",
  );
  if (review)
    add(
      "document",
      "Documento fiscal do tomador",
      isValidTaxDoc(review.tomador.documento),
      "Corrija o CPF/CNPJ do tomador.",
    );
  let references: ServiceReference[] = [];
  if (row.config_version) {
    // Contract access was checked above before using the privileged diagnostic/reference projection.
    const result = await admin
      .from("rental_nfse_service_references")
      .select("*")
      .eq("contract_id", contract.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (result.error) dbFailure(result.error, contract.id);
    references = result.data ?? [];
  }
  let reference = references.find((ref) => ref.id === review?.referenceId) ?? null;
  if (review?.referenceId && !reference) {
    const result = await admin
      .from("rental_nfse_service_references")
      .select("*")
      .eq("contract_id", contract.id)
      .eq("id", review.referenceId)
      .maybeSingle();
    if (result.error) dbFailure(result.error, contract.id);
    reference = result.data;
    add(
      "reference",
      "Ocorrência vinculada ao contrato",
      !!reference,
      "A referência selecionada não pertence a este contrato.",
    );
  }
  if (profile?.elegibilidade === "pagamento")
    add(
      "eligibility",
      "Pagamento registrado como origem",
      reference?.source === "payment",
      "Selecione a ocorrência de pagamento preservada na baixa. Histórico anterior exige revisão da política fiscal.",
    );
  if (reference && profile?.valorOrigem === "comissao_mensal")
    add(
      "historicalValue",
      "Valor corresponde à remuneração preservada",
      reference.valor_servico !== null && Number(reference.valor_servico) === review?.valor,
      "O valor deve corresponder à remuneração preservada na ocorrência. Divergências exigem revisão do perfil e da origem do valor.",
    );
  const modoTeste = row.modo_teste || input.modoTeste !== false;
  if (!modoTeste) {
    add(
      "production",
      "Autorização de produção registrada",
      !!profile?.productionAuthorization &&
        row.production_authorized_config_version === row.config_version,
      "A produção exige autorização explícita por empresa e operação nesta versão.",
    );
    add(
      "test",
      "Esta versão foi validada em teste",
      await testedConfig(admin, row),
      "Valide esta versão da configuração em teste antes da produção.",
    );
  }
  const issuer = normalizeTaxDoc(row.cnpj);
  const operation = profile?.operation ?? "administracao";
  let revisionOf: FiscalSnapshot["revisionOf"] = null;
  if (review?.replacesEmissionId) {
    const previous = await admin
      .from("rental_nfse_emissions")
      .select("*")
      .eq("id", review.replacesEmissionId)
      .eq("contract_id", contract.id)
      .maybeSingle();
    if (previous.error) dbFailure(previous.error, contract.id);
    const parent = previous.data as EmissionRow | null;
    const { parseNfseResponse } = await import("./ipm/response");
    const refusalProved =
      parent?.status === "erro" &&
      (parent.transport === "nao_enviado" ||
        (parent.transport === "ok" &&
          parent.response_complete === true &&
          parent.transition_details?.mode !== "consulta" &&
          classifyResult(
            parseNfseResponse(parent.response_raw ?? ""),
            parent.http_status ?? null,
            false,
          ) === "erro"));
    const resolvedNotIssued =
      parent?.status === "nao_emitida" &&
      !!parent.resolved_by &&
      !!parent.resolved_at &&
      (parent.resolution_reason?.trim().length ?? 0) >= 10;
    const canRevise =
      !!parent &&
      !parent.modo_teste &&
      !parent.numero_nfse &&
      parent.issuer_identity === issuer &&
      parent.competencia === `${input.competencia}-01` &&
      (refusalProved || resolvedNotIssued);
    add(
      "revision",
      "Revisão vinculada a tentativa comprovadamente não emitida",
      canRevise,
      "A revisão exige recusa comprovada ou resolução manual como não emitida, mesmo prestador e competência. Situações incertas e registros legados exigem conferência.",
    );
    if (canRevise && parent)
      revisionOf = {
        id: parent.id,
        attemptId: parent.attempt_id ?? null,
        updatedAt: parent.updated_at,
        snapshotHash: parent.snapshot_hash ?? null,
        identificador: parent.identificador,
      };
  }
  // Test validations may have distinct reviewed payloads without consuming a real fiscal identity.
  // A repeated test of identical data keeps its identifier. Real identity never changes on recovery.
  const { snapshotHash } = await import("./preview-token.server");
  const testRevision = snapshotHash({
    settings: fiscalSettings(row),
    configVersion: row.config_version,
    profile,
    review,
    contractRevision: contract.updated_at,
  }).slice(0, 10);
  const identificadorTeste = identity(
    `${issuer}-${testRevision}`,
    operation,
    contract.id,
    input.competencia,
    true,
  );
  const revisionIssuer = revisionOf
    ? `${issuer}-R${snapshotHash(revisionOf.id).slice(0, 10)}`
    : issuer;
  const identificadorReal = identity(
    revisionIssuer,
    operation,
    contract.id,
    input.competencia,
    false,
  );
  const identificador = modoTeste ? identificadorTeste : identificadorReal;
  let payload: NfsePayload | null = null;
  let snapshot: FiscalSnapshot | null = null;
  let xml: string | null = null;
  if (profile && review) {
    const retencoes = Object.fromEntries(
      Object.entries(profile.retencoes).map(([key, rate]) => [
        key,
        Math.round(review.valor * rate) / 100,
      ]),
    ) as NonNullable<NfsePayload["retencoes"]>;
    payload = {
      teste: modoTeste,
      identificador,
      valor: review.valor,
      dataFatoGerador: review.dataFatoGerador,
      layout: profile.layout,
      descritivo: `${profile.descricao}. Competência ${input.competencia}`,
      observacao: `Competência ${input.competencia}`,
      prestador: { cpfCnpj: issuer, cidadeTom: row.cidade_tom },
      tomador: {
        tipo: inferTomadorTipo(review.tomador.documento),
        cpfCnpj: normalizeTaxDoc(review.tomador.documento),
        nomeRazaoSocial: review.tomador.nome,
        logradouro: review.tomador.logradouro,
        numeroResidencia: review.tomador.numero,
        bairro: review.tomador.bairro,
        cidadeTom: review.tomador.cidadeTom,
        cep: review.tomador.cep,
      },
      item: {
        codigoLocalPrestacaoServico: profile.localPrestacao,
        codigoItemListaServico: row.codigo_item_lista_servico,
        codigoNbs: row.codigo_nbs,
        aliquota: Number(row.aliquota_iss),
        situacaoTributaria: row.situacao_tributaria,
        tributaMunicipioPrestador: row.tributa_municipio_prestador as "S" | "N",
      },
      retencoes,
      ibsCbs: profile.ibsCbs
        ? {
            cLocalidadeIncid: row.codigo_ibge_municipio,
            cIndOp: row.ibs_cbs_c_ind_op,
            cst: row.ibs_cbs_cst,
            cClassTrib: row.ibs_cbs_c_class_trib,
            finNFSe: profile.finNFSe ?? undefined,
            indFinal: profile.indFinal ?? undefined,
            tpOper: profile.tpOper ?? undefined,
            refNfse: review.refNfse,
            imovel: review.ibsCbsImovel,
          }
        : null,
    };
    try {
      xml = buildNfseXml(payload);
    } catch (error) {
      add(
        "layout",
        "Campos exigidos pela operação",
        false,
        error instanceof Error ? error.message : "Revise os campos condicionais do perfil fiscal.",
      );
    }
    snapshot = {
      version: 1,
      contractId: contract.id,
      contractRevision: contract.updated_at,
      brand,
      issuerIdentity: issuer,
      configVersion: row.config_version ?? 0,
      fiscalSettings: fiscalSettings(row),
      profile,
      competencia: input.competencia,
      review,
      reference,
      payload,
      revisionOf,
    };
  }
  return {
    contract,
    row,
    profile,
    brand,
    modoTeste,
    checks,
    references,
    reference,
    snapshot,
    xml,
    identificador,
    identificadorTeste,
    identificadorReal,
    issuer,
    senha,
    bloqueado: checks.some((check) => !check.ok) || !snapshot || !xml,
  };
}
// POST prevents fiscal review data from being serialized into URL query strings.
export const previewRentalNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof previewSchema>) => zParse(previewSchema, d))
  .handler(async ({ data, context }): Promise<NfsePreview> => {
    await assertFiscalRole(context.supabase as unknown as AuthedSupabase, context.userId);
    const ctx = await prepare(context.supabase as unknown as DbClient, data);
    if (
      !ctx.modoTeste &&
      data.review?.replacesEmissionId &&
      !(await hasAdminRole(context.supabase as unknown as AuthedSupabase, context.userId))
    )
      throw new Error(
        "A administração deve confirmar a revisão da identidade fiscal após uma recusa.",
      );
    const admin = await getAdmin();
    if (ctx.row.config_version) await expireStaleProcessing(admin, ctx.contract.id);
    const result = await (context.supabase as unknown as DbClient)
      .from("rental_nfse_emissions")
      .select("id,status,modo_teste,created_at")
      .eq("contract_id", data.contractId)
      .eq("competencia", `${data.competencia}-01`)
      .order("created_at", { ascending: false });
    if (result.error) dbFailure(result.error, data.contractId);
    const { snapshotHash, signPreview } = await import("./preview-token.server");
    return {
      brand: ctx.brand,
      competencia: data.competencia,
      valor: data.review?.valor ?? 0,
      tomadorNome: data.review?.tomador.nome ?? null,
      tomadorDocumento: data.review ? normalizeTaxDoc(data.review.tomador.documento) : null,
      identificadorTeste: ctx.identificadorTeste,
      identificadorReal: ctx.identificadorReal,
      configModoTeste: ctx.row.modo_teste,
      checklist: ctx.checks,
      bloqueado: ctx.bloqueado,
      existentes: (result.data ?? []).map(
        (r: { id: string; status: EmissionStatus; modo_teste: boolean; created_at: string }) => ({
          id: r.id,
          status: r.status,
          modoTeste: r.modo_teste,
          createdAt: r.created_at,
        }),
      ),
      previewToken:
        !ctx.bloqueado && ctx.senha
          ? signPreview(snapshotHash(ctx.snapshot), context.userId, ctx.senha)
          : null,
      serviceDescription: ctx.profile?.descricao ?? "Perfil fiscal pendente de aprovação",
      prestadorNome: ctx.row.razao_social,
      prestadorDocumento: ctx.row.cnpj,
      dataFatoGerador: data.review?.dataFatoGerador ?? null,
      profile: ctx.profile,
      requiresProperty:
        !!ctx.profile?.ibsCbs && ["020101", "020201", "020301"].includes(ctx.row.ibs_cbs_c_ind_op),
      sourceDescription: ctx.reference
        ? `Ocorrência ${ctx.reference.source_key}; valores e tomador revisados explicitamente.`
        : "Revisão manual: nenhum histórico anterior foi presumido.",
      references: ctx.references.map((ref) => ({
        id: ref.id,
        source: ref.source,
        vencimentoOriginal: ref.vencimento_original,
        valorServico: ref.valor_servico,
        createdAt: ref.created_at,
      })),
    };
  });

async function expireStaleProcessing(admin: DbClient, contractId: string) {
  const result = await admin
    .from("rental_nfse_emissions")
    .update({
      status: "incerto",
      transition_actor: null,
      transition_reason: "processamento_expirado",
      transition_details: {
        reason: "Sem resultado persistido no prazo; não autoriza nova emissão.",
      },
      updated_at: new Date().toISOString(),
    })
    .eq("contract_id", contractId)
    .eq("status", "processando")
    .lt("updated_at", new Date(Date.now() - PROCESSANDO_STALE_MS).toISOString());
  if (result.error) dbFailure(result.error, contractId);
}
const listSchema = z.object({
  contractId: uuid,
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  modoTeste: z.boolean().optional(),
});
export const listRentalNfseEmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof listSchema>) => zParse(listSchema, d))
  .handler(async ({ data, context }) => {
    await assertFiscalRole(context.supabase as unknown as AuthedSupabase, context.userId);
    const db = context.supabase as unknown as DbClient;
    await loadContract(db, data.contractId);
    const admin = await getAdmin();
    // Migration presence is checked before expiry; historical read stays possible before coordinated deployment.
    const settings = await db.from("nfse_provider_settings").select("*").limit(1);
    if (settings.error) dbFailure(settings.error, data.contractId);
    if (settings.data?.[0]?.config_version) await expireStaleProcessing(admin, data.contractId);
    let query = db
      .from("rental_nfse_emissions")
      .select(EMISSION_COLUMNS)
      .eq("contract_id", data.contractId);
    if (data.modoTeste !== undefined) query = query.eq("modo_teste", data.modoTeste);
    const result = await query
      .order("competencia", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(data.offset ?? 0, (data.offset ?? 0) + (data.limit ?? 25) - 1);
    if (result.error) dbFailure(result.error, data.contractId);
    const rows = (result.data as EmissionRow[]) ?? [];
    if (settings.data?.[0]?.config_version && rows.length) {
      const diagnostic = await admin
        .from("rental_nfse_emissions")
        .select("id,transport")
        .in(
          "id",
          rows.map((row) => row.id),
        );
      if (diagnostic.error) dbFailure(diagnostic.error, data.contractId);
      const transport = new Map<string, string>(
        (diagnostic.data ?? []).map((row: { id: string; transport: string }) => [
          row.id,
          row.transport,
        ]),
      );
      for (const row of rows) row.transport = transport.get(row.id) ?? null;
    }
    return rows.map(mapEmission);
  });

function collision(error: { code?: string }): never {
  if (error.code === "23514")
    throw new Error(
      "A referência, a configuração ou a situação fiscal mudou. Atualize a prévia e confira o histórico e as pendências do prestador antes de continuar.",
    );
  if (error.code === "23505" || error.code === "P0001")
    throw new Error(
      "Há uma operação com esta identidade ou outra emissão pendente do mesmo prestador. Atualize o histórico e confira antes de enviar.",
    );
  dbFailure(error);
}
async function visibleEmission(db: DbClient, id: string): Promise<EmissionRow> {
  const result = await db
    .from("rental_nfse_emissions")
    .select(EMISSION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (result.error) dbFailure(result.error, id);
  if (!result.data) throw new Error("Emissão não encontrada ou sem permissão de acesso.");
  return result.data;
}
async function preserveEvidence(
  admin: DbClient,
  row: EmissionRow,
  actor: string,
  details: Record<string, unknown>,
) {
  const result = await admin.from("rental_nfse_emission_events").insert({
    emission_id: row.id,
    from_status: null,
    to_status: null,
    actor,
    actor_kind: "sistema",
    reason: "resposta_sem_transicao",
    attempt_id: row.attempt_id,
    evidence_kind: "late_response",
    details,
  });
  if (result.error) dbFailure(result.error, row.id);
}
async function sendAndRecord(opts: {
  admin: DbClient;
  row: EmissionRow;
  settings: SettingsRow;
  xml: string;
  actor: string;
  mode: "emissao" | "consulta" | "reenvio";
}) {
  const { admin, row, settings } = opts;
  const brand = normalizeNfseBrand(row.brand);
  const { postNfse } = await import("./ipm/client.server");
  const result = await postNfse({
    endpointUrl: settings.endpoint_url,
    login: readSecret(secretNames(brand).login) ?? normalizeTaxDoc(settings.cnpj),
    senha: readSecret(secretNames(brand).senha) ?? "",
    cidade: settings.cidade_tom,
    xml: opts.xml,
  });
  const p = result.parsed;
  let status: EmissionStatus =
    result.transport === "nao_enviado"
      ? "erro"
      : result.transport !== "ok"
        ? "incerto"
        : classifyResult(p, result.httpStatus ?? 0, row.modo_teste);
  // Query rejection / absence is not proof of non-issuance. Nor may an unrelated complete note resolve this operation.
  if (opts.mode === "consulta" && status === "erro") status = "incerto";
  // Refusal of a replay is not proof that the earlier uncertain send did not issue.
  if (row.transition_details?.previous_status === "incerto" && status === "erro")
    status = "incerto";
  const identityMismatch = Boolean(
    (p.cnpjPrestador && normalizeTaxDoc(p.cnpjPrestador) !== row.issuer_identity) ||
    (p.identificador && p.identificador !== row.identificador),
  );
  if (identityMismatch) status = "incerto";
  const details = {
    mode: opts.mode,
    previous_status: row.transition_details?.previous_status ?? null,
    transport: result.transport,
    http_status: result.httpStatus,
    duration_ms: result.durationMs,
    response_raw: result.raw,
    response_complete: result.responseComplete,
    parser_version: result.parserVersion,
    attempt_id: row.attempt_id,
  };
  const patch = {
    status,
    http_status: result.httpStatus,
    duration_ms: result.durationMs,
    response_raw: result.raw || null,
    response_complete: result.responseComplete,
    parser_version: result.parserVersion,
    transport: result.transport,
    error_codes: p.codigosErro,
    error_message: p.mensagem,
    finished_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    numero_nfse: row.modo_teste
      ? null
      : identityMismatch
        ? row.numero_nfse
        : (p.numeroNfse ?? row.numero_nfse),
    serie_nfse: row.modo_teste
      ? null
      : identityMismatch
        ? row.serie_nfse
        : (p.serieNfse ?? row.serie_nfse),
    codigo_verificador: row.modo_teste
      ? null
      : identityMismatch
        ? row.codigo_verificador
        : (p.codigoVerificador ?? row.codigo_verificador),
    link_pdf: row.modo_teste
      ? null
      : identityMismatch
        ? row.link_pdf
        : (safeNfseDocumentUrl(p.linkPdf) ?? row.link_pdf),
    data_emissao_nfse: row.modo_teste
      ? null
      : identityMismatch
        ? row.data_emissao_nfse
        : p.dataNfse
          ? [p.dataNfse, p.horaNfse].filter(Boolean).join(" ")
          : row.data_emissao_nfse,
    situacao_nfse:
      row.modo_teste || identityMismatch ? null : (p.situacaoDescricao ?? p.situacaoCodigo),
    transition_actor: opts.actor,
    transition_reason: opts.mode,
    transition_details: details,
  };
  const updated = await admin
    .from("rental_nfse_emissions")
    .update(patch)
    .eq("id", row.id)
    .eq("status", "processando")
    .eq("attempt_id", row.attempt_id)
    .select(EMISSION_COLUMNS)
    .maybeSingle();
  if (updated.error || !updated.data) {
    await preserveEvidence(admin, row, opts.actor, details);
    throw new Error(
      `A resposta foi preservada para conferência, sem substituir uma situação mais recente. Não emita outra nota. Referência: ${row.id}.`,
    );
  }
  const emission = mapEmission({ ...updated.data, transport: result.transport });
  return {
    emission,
    message:
      status === "emitida"
        ? "NFS-e emitida."
        : status === "teste_ok"
          ? "Validada em teste, sem valor fiscal."
          : status === "cancelada"
            ? "A prefeitura informou nota cancelada."
            : (emission.errorMessage ?? "Situação atualizada."),
  };
}
const emitSchema = previewSchema.extend({
  previewToken: z.string().min(1).max(200),
  confirmarEmissaoReal: z.boolean().optional(),
});
export const emitRentalNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof emitSchema>) => zParse(emitSchema, d))
  .handler(async ({ data, context }) => {
    await assertFiscalRole(context.supabase as unknown as AuthedSupabase, context.userId);
    const ctx = await prepare(context.supabase as unknown as DbClient, data);
    resolveModoTeste({
      configModoTeste: ctx.row.modo_teste,
      pedidoModoTeste: data.modoTeste,
      confirmarEmissaoReal: data.confirmarEmissaoReal,
    });
    if (
      !ctx.modoTeste &&
      data.review?.replacesEmissionId &&
      !(await hasAdminRole(context.supabase as unknown as AuthedSupabase, context.userId))
    )
      throw new Error(
        "A administração deve confirmar a revisão da identidade fiscal após uma recusa.",
      );
    if (ctx.bloqueado || !ctx.snapshot || !ctx.xml || !ctx.senha)
      throw new Error(
        `Dados pendentes: ${ctx.checks
          .filter((check) => !check.ok)
          .map((check) => check.detail ?? check.label)
          .join(" ")}`,
      );
    const { snapshotHash, verifyPreview } = await import("./preview-token.server");
    const hash = snapshotHash(ctx.snapshot);
    if (!verifyPreview(data.previewToken, hash, context.userId, ctx.senha))
      throw new Error(
        "A prévia mudou ou expirou. Revise os dados atualizados e confirme novamente.",
      );
    const admin = await getAdmin();
    await expireStaleProcessing(admin, data.contractId);
    const existing = await admin
      .from("rental_nfse_emissions")
      .select("*")
      .eq("contract_id", data.contractId)
      .eq("competencia", `${data.competencia}-01`)
      .eq("modo_teste", ctx.modoTeste);
    if (existing.error) dbFailure(existing.error, data.contractId);
    for (const row of (existing.data ?? []) as EmissionRow[]) {
      if (row.identificador === ctx.identificador && row.snapshot_hash === hash)
        return {
          emission: mapEmission(row),
          message: "Esta operação já foi registrada. Consulte a situação no histórico.",
        };
      const reviewedPrior =
        !ctx.modoTeste &&
        !!ctx.snapshot.revisionOf &&
        row.issuer_identity === ctx.issuer &&
        ["erro", "nao_emitida"].includes(row.status) &&
        !row.numero_nfse &&
        row.identificador !== ctx.identificador;
      if (!reviewedPrior && (!ctx.modoTeste || row.identificador === ctx.identificador))
        throw new Error(
          "Já existe uma operação para esta competência. Uma alteração material exige revisão fiscal; não é permitido reutilizar sua identidade para outro conteúdo.",
        );
    }
    // The payment occurrence remains immutable and unclassified. Its reviewed
    // fiscal decision is a separate reference, prepared before emission intent.
    let referenceId: string;
    {
      const reference = await admin.from("rental_nfse_service_references").upsert(
        {
          contract_id: data.contractId,
          source: "manual_review",
          source_key: `review:${hash}`,
          competencia: `${data.competencia}-01`,
          fato_gerador: data.review!.dataFatoGerador,
          valor_servico: data.review!.valor,
          contract_snapshot: ctx.reference?.contract_snapshot ?? ctx.contract,
          decision: {
            ...data.review,
            reason: data.review!.motivo,
            source_reference_id: ctx.reference?.id ?? null,
            actor: context.userId,
            operation: ctx.profile!.operation,
          },
          created_by: context.userId,
        },
        { onConflict: "contract_id,source_key", ignoreDuplicates: true },
      );
      if (reference.error) dbFailure(reference.error, data.contractId);
      const saved = await admin
        .from("rental_nfse_service_references")
        .select("id")
        .eq("contract_id", data.contractId)
        .eq("source_key", `review:${hash}`)
        .single();
      if (saved.error) dbFailure(saved.error, data.contractId);
      referenceId = saved.data.id;
    }
    const { randomUUID } = await import("node:crypto");
    const inserted = await admin
      .from("rental_nfse_emissions")
      .insert({
        contract_id: data.contractId,
        brand: ctx.brand,
        competencia: `${data.competencia}-01`,
        valor: ctx.snapshot.review.valor,
        modo_teste: ctx.modoTeste,
        status: "processando",
        request_xml: ctx.xml,
        identificador: ctx.identificador,
        issuer_identity: ctx.issuer,
        snapshot: ctx.snapshot,
        snapshot_hash: hash,
        config_version: ctx.row.config_version,
        attempt_id: randomUUID(),
        service_reference_id: referenceId,
        created_by: context.userId,
        confirmacao_real_por: ctx.modoTeste ? null : context.userId,
        transition_actor: context.userId,
        transition_reason: "emissao_assistida",
        transition_details: { snapshot_hash: hash, approval: ctx.profile!.approvalReference },
      })
      .select("*")
      .single();
    if (inserted.error) collision(inserted.error);
    // AFTER trigger has already committed the transition event with the processing row before any network transmission.
    return sendAndRecord({
      admin,
      row: inserted.data,
      settings: ctx.row,
      xml: ctx.xml,
      actor: context.userId,
      mode: "emissao",
    });
  });

const reconcileSchema = z.object({
  emissionId: uuid,
  modo: z.enum(["consulta", "reenvio"]).optional(),
  confirmarReenvioReal: z.boolean().optional(),
});
export const reconcileRentalNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof reconcileSchema>) => zParse(reconcileSchema, d))
  .handler(async ({ data, context }) => {
    await assertFiscalRole(context.supabase as unknown as AuthedSupabase, context.userId);
    const visible = await visibleEmission(context.supabase as unknown as DbClient, data.emissionId);
    const admin = await getAdmin();
    await expireStaleProcessing(admin, visible.contract_id);
    const result = await admin
      .from("rental_nfse_emissions")
      .select("*")
      .eq("id", visible.id)
      .single();
    if (result.error) dbFailure(result.error, visible.id);
    const row = result.data as EmissionRow;
    if (!["incerto", "erro"].includes(row.status))
      throw new Error(
        "Esta operação não está disponível para recuperação agora. Notas concluídas permanecem disponíveis pelo documento no histórico.",
      );
    const settings = await loadSettings(
      context.supabase as unknown as DbClient,
      normalizeNfseBrand(row.brand),
    );
    if (!row.snapshot || !row.issuer_identity || !row.attempt_id)
      throw new Error(
        "Registro legado sem identidade fiscal comprovada. Confira no portal e encaminhe a referência à operação interna.",
      );
    if (
      normalizeTaxDoc(settings.cnpj) !== row.issuer_identity ||
      normalizeTaxDoc(
        readSecret(secretNames(normalizeNfseBrand(row.brand)).login) ?? settings.cnpj,
      ) !== row.issuer_identity
    )
      throw new Error(
        "A identidade fiscal da configuração mudou. Restaure o prestador original antes da recuperação.",
      );
    if (
      !isAllowedEndpoint(settings.endpoint_url) ||
      !readSecret(secretNames(normalizeNfseBrand(row.brand)).senha)
    )
      throw new Error("Revise o endereço oficial e a credencial do prestador.");
    const mode = data.modo ?? "consulta";
    let xml: string;
    if (mode === "consulta") {
      if (!row.codigo_verificador)
        throw new Error(
          "Esta nota não tem código de autenticidade para consulta documentada. Confira no portal ou revise explicitamente o reenvio da mesma operação.",
        );
      xml = buildNfseConsultXml({ codigoAutenticidade: row.codigo_verificador });
    } else {
      if (row.status === "emitida") throw new Error("Uma nota emitida só pode ser consultada.");
      if (!row.request_xml || !row.identificador)
        throw new Error("XML original indisponível; utilize a conferência no portal.");
      const { canonicalJson } = await import("./fiscal-profile");
      const { snapshotHash } = await import("./preview-token.server");
      if (
        snapshotHash(row.snapshot) !== row.snapshot_hash ||
        buildNfseXml(row.snapshot.payload) !== row.request_xml
      )
        throw new Error(
          "O registro original precisa de verificação de integridade. Confira no portal antes de prosseguir.",
        );
      if (
        row.config_version !== settings.config_version ||
        canonicalJson(row.snapshot.fiscalSettings) !== canonicalJson(fiscalSettings(settings)) ||
        canonicalJson(row.snapshot.profile) !==
          canonicalJson(readFiscalProfile(settings.fiscal_profile, settings.cidade_tom))
      )
        throw new Error(
          "O perfil fiscal mudou desde o envio. A recuperação exige a versão e o prestador originais; rotação de senha é permitida sem mudar a identidade.",
        );
      if (!row.modo_teste) {
        resolveModoTeste({
          configModoTeste: settings.modo_teste,
          pedidoModoTeste: false,
          confirmarEmissaoReal: data.confirmarReenvioReal,
        });
      }
      xml = row.request_xml;
    }
    const { randomUUID } = await import("node:crypto");
    const claimed = await admin
      .from("rental_nfse_emissions")
      .update({
        status: "processando",
        attempts: (row.attempts ?? 1) + 1,
        response_raw: null,
        http_status: null,
        response_complete: false,
        parser_version: null,
        transport: null,
        error_message: null,
        error_codes: null,
        duration_ms: null,
        finished_at: null,
        attempt_id: randomUUID(),
        updated_at: new Date().toISOString(),
        transition_actor: context.userId,
        transition_reason: mode,
        transition_details: {
          mode,
          previous_status: row.status,
          authorization: row.modo_teste
            ? "teste"
            : mode === "consulta"
              ? "somente_consulta"
              : "reenvio_real_confirmado",
        },
      })
      .eq("id", row.id)
      .eq("status", row.status)
      .eq("attempt_id", row.attempt_id)
      .select("*")
      .maybeSingle();
    if (claimed.error) collision(claimed.error);
    if (!claimed.data) throw new Error("A situação mudou. Atualize antes de continuar.");
    return sendAndRecord({ admin, row: claimed.data, settings, xml, actor: context.userId, mode });
  });

const markSchema = z.object({
  emissionId: uuid,
  reason: z.string().trim().min(10).max(1000),
  conferidoNoPortal: z.boolean(),
});
export const markRentalNfseNotIssued = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof markSchema>) => zParse(markSchema, d))
  .handler(async ({ data, context }) => {
    const isAdmin = await hasAdminRole(
      context.supabase as unknown as AuthedSupabase,
      context.userId,
    );
    if (!isAdmin) throw new Error("Apenas a administração pode registrar a resolução manual.");
    const visible = await visibleEmission(context.supabase as unknown as DbClient, data.emissionId);
    const admin = await getAdmin();
    await expireStaleProcessing(admin, visible.contract_id);
    const fresh = await admin
      .from("rental_nfse_emissions")
      .select("*")
      .eq("id", visible.id)
      .single();
    if (fresh.error) dbFailure(fresh.error, visible.id);
    const row = fresh.data as EmissionRow;
    const refusal = checkMarkNotIssued({
      isAdmin,
      status: row.status,
      numeroNfse: row.numero_nfse,
      reason: data.reason,
      conferidoNoPortal: data.conferidoNoPortal,
    });
    if (refusal) throw new Error(refusal);
    const updated = await admin
      .from("rental_nfse_emissions")
      .update({
        status: "nao_emitida",
        resolved_by: context.userId,
        resolved_at: new Date().toISOString(),
        resolution_reason: data.reason,
        updated_at: new Date().toISOString(),
        transition_actor: context.userId,
        transition_reason: "nao_emitida_confirmada_no_portal",
        transition_details: { reason: data.reason },
      })
      .eq("id", row.id)
      .eq("status", "incerto")
      .eq("updated_at", row.updated_at)
      .is("numero_nfse", null)
      .select(EMISSION_COLUMNS)
      .maybeSingle();
    if (updated.error) dbFailure(updated.error, row.id);
    if (!updated.data)
      throw new Error("A situação mudou. Atualize antes de registrar a resolução.");
    return {
      emission: mapEmission(updated.data),
      message:
        "Resolução registrada e histórico preservado. Uma nova operação exige revisão fiscal da identidade.",
    };
  });

export const reclassifyStuckNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await hasAdminRole(context.supabase as unknown as AuthedSupabase, context.userId)))
      throw new Error("Apenas a administração pode reclassificar pendências.");
    const db = context.supabase as unknown as DbClient;
    const visible = await db
      .from("rental_nfse_emissions")
      .select("id,contract_id")
      .in("status", ["incerto", "processando"]);
    if (visible.error) dbFailure(visible.error);
    const admin = await getAdmin();
    const { parseNfseResponse, NFSE_PARSER_VERSION } = await import("./ipm/response");
    let analisadas = 0;
    let semRetorno = 0;
    const alteradas: { id: string; de: string; para: string }[] = [];
    for (const item of (visible.data ?? []) as { id: string; contract_id: string }[]) {
      await expireStaleProcessing(admin, item.contract_id);
      const fresh = await admin
        .from("rental_nfse_emissions")
        .select("*")
        .eq("id", item.id)
        .single();
      if (fresh.error) dbFailure(fresh.error, item.id);
      const row = fresh.data as EmissionRow;
      analisadas++;
      // A late response is evidence only until this conditional reconciliation.
      // Never use evidence from an older attempt to resolve the current one.
      const late = row.attempt_id
        ? await admin
            .from("rental_nfse_emission_events")
            .select("details")
            .eq("emission_id", row.id)
            .eq("attempt_id", row.attempt_id)
            .eq("evidence_kind", "late_response")
            .order("created_at", { ascending: false })
            .limit(1)
        : { data: [], error: null };
      if (late.error) dbFailure(late.error, row.id);
      const evidence = late.data?.[0]?.details as
        | {
            response_raw?: string;
            http_status?: number;
            response_complete?: boolean;
            parser_version?: string;
            transport?: string;
            mode?: string;
            previous_status?: EmissionStatus;
          }
        | undefined;
      const raw = evidence?.response_raw ?? row.response_raw;
      const httpStatus = evidence?.http_status ?? row.http_status ?? null;
      const complete = evidence?.response_complete ?? row.response_complete === true;
      const parserVersion = evidence?.parser_version ?? row.parser_version ?? null;
      const transport = evidence?.transport ?? row.transport;
      if (!raw) {
        semRetorno++;
        continue;
      }
      const next = reclassifyFromRaw(row.status, raw, row.modo_teste, parseNfseResponse, {
        httpStatus,
        responseComplete: complete,
        attemptId: row.attempt_id ?? null,
        parserVersion,
      });
      const responseMode = evidence?.mode ?? row.transition_details?.mode;
      const previousStatus = evidence?.previous_status ?? row.transition_details?.previous_status;
      if (
        !next ||
        transport !== "ok" ||
        (next === "erro" && (responseMode === "consulta" || previousStatus === "incerto"))
      )
        continue;
      const parsed = parseNfseResponse(raw);
      if (
        (parsed.cnpjPrestador && normalizeTaxDoc(parsed.cnpjPrestador) !== row.issuer_identity) ||
        (parsed.identificador && parsed.identificador !== row.identificador)
      )
        continue;
      const updated = await admin
        .from("rental_nfse_emissions")
        .update({
          status: next,
          numero_nfse: row.modo_teste ? null : parsed.numeroNfse,
          serie_nfse: row.modo_teste ? null : parsed.serieNfse,
          codigo_verificador: row.modo_teste ? null : parsed.codigoVerificador,
          link_pdf: row.modo_teste ? null : safeNfseDocumentUrl(parsed.linkPdf),
          parser_version: NFSE_PARSER_VERSION,
          response_raw: raw,
          response_complete: complete,
          http_status: httpStatus,
          transport,
          updated_at: new Date().toISOString(),
          transition_actor: context.userId,
          transition_reason: "reclassificacao_parser",
          transition_details: {
            original_parser: row.parser_version,
            parser: NFSE_PARSER_VERSION,
            http_status: row.http_status,
            attempt_id: row.attempt_id,
          },
        })
        .eq("id", row.id)
        .eq("status", "incerto")
        .eq("attempt_id", row.attempt_id)
        .eq("updated_at", row.updated_at)
        .select("id");
      if (updated.error) dbFailure(updated.error, row.id);
      if (updated.data?.length) alteradas.push({ id: row.id, de: row.status, para: next });
    }
    return { analisadas, semRetorno, alteradas };
  });
export type NfseBrandHealth = {
  brand: NfseBrand;
  ultima: {
    status: EmissionStatus;
    modoTeste: boolean;
    createdAt: string;
    mensagem: string | null;
  } | null;
  ultimoSucessoReal: string | null;
  incerto30d: number;
  erro30d: number;
  naoEmitida30d: number;
};
export const getNfseHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NfseBrandHealth[]> => {
    await assertFiscalRole(context.supabase as unknown as AuthedSupabase, context.userId);
    const db = context.supabase as unknown as DbClient;
    const out: NfseBrandHealth[] = [];
    for (const brand of ["cordial", "morar"] as const) {
      const [last, success, uncertain, refused, resolved] = await Promise.all([
        db
          .from("rental_nfse_emissions")
          .select("id,status,modo_teste,created_at")
          .eq("brand", brand)
          .order("created_at", { ascending: false })
          .limit(1),
        db
          .from("rental_nfse_emissions")
          .select("created_at")
          .eq("brand", brand)
          .eq("status", "emitida")
          .eq("modo_teste", false)
          .order("created_at", { ascending: false })
          .limit(1),
        ...["incerto", "erro", "nao_emitida"].map((status) =>
          db
            .from("rental_nfse_emissions")
            .select("id", { count: "exact", head: true })
            .eq("brand", brand)
            .eq("status", status)
            .gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString()),
        ),
      ]);
      for (const result of [last, success, uncertain, refused, resolved])
        if (result.error) dbFailure(result.error);
      const row = last.data?.[0];
      out.push({
        brand,
        ultima: row
          ? {
              status: row.status,
              modoTeste: row.modo_teste,
              createdAt: row.created_at,
              mensagem: safeMessage(row.status, row.id),
            }
          : null,
        ultimoSucessoReal: success.data?.[0]?.created_at ?? null,
        incerto30d: uncertain.count ?? 0,
        erro30d: refused.count ?? 0,
        naoEmitida30d: resolved.count ?? 0,
      });
    }
    return out;
  });
