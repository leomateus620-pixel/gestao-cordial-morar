import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildNfseXml, inferTomadorTipo, onlyDigits } from "./ipm/xml";
import type { NfsePayload } from "./ipm/xml";

export type NfseBrand = "cordial" | "morar";

export type NfseSettings = {
  brand: NfseBrand;
  cnpj: string;
  inscricaoMunicipal: string | null;
  razaoSocial: string | null;
  cidadeTom: string;
  codigoIbgeMunicipio: string;
  endpointUrl: string;
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
  status: "teste_ok" | "emitida" | "erro" | "cancelada";
  modoTeste: boolean;
  numeroNfse: string | null;
  codigoVerificador: string | null;
  linkPdf: string | null;
  errorMessage: string | null;
  createdAt: string;
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
  codigo_verificador: string | null;
  link_pdf: string | null;
  error_message: string | null;
  created_at: string;
};

const EMISSION_COLUMNS =
  "id,contract_id,brand,competencia,valor,status,modo_teste,numero_nfse,codigo_verificador,link_pdf,error_message,created_at";

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
    endpointUrl: row.endpoint_url,
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
  return {
    id: row.id,
    contractId: row.contract_id,
    brand: row.brand,
    competencia: row.competencia,
    valor: Number(row.valor ?? 0),
    status: (["teste_ok", "emitida", "erro", "cancelada"].includes(row.status)
      ? row.status
      : "erro") as NfseEmission["status"],
    modoTeste: row.modo_teste,
    numeroNfse: row.numero_nfse,
    codigoVerificador: row.codigo_verificador,
    linkPdf: row.link_pdf,
    errorMessage: row.error_message,
    createdAt: row.created_at,
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

export const getNfseSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand?: string } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    await assertFiscalRole(context.supabase as unknown as AuthedSupabase, context.userId);
    const brand = normalizeNfseBrand(data.brand);
    const { data: row, error } = await context.supabase
      .from("nfse_provider_settings")
      .select("*")
      .eq("brand", brand)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Configuração fiscal não encontrada para esta marca.");
    const senha = readSecret(secretNames(brand).senha);
    return mapSettings(row as unknown as SettingsRow, Boolean(senha));
  });

export const saveNfseSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      brand: string;
      cnpj?: string;
      inscricaoMunicipal?: string | null;
      razaoSocial?: string | null;
      codigoItemListaServico?: string;
      codigoNbs?: string | null;
      aliquotaIss?: number;
      situacaoTributaria?: string;
      tributaMunicipioPrestador?: "S" | "N";
      cIndOp?: string;
      cst?: string;
      cClassTrib?: string;
      modoTeste?: boolean;
      simplesNacional?: boolean;
      endpointUrl?: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertFiscalRole(context.supabase as unknown as AuthedSupabase, context.userId);
    const brand = normalizeNfseBrand(data.brand);
    const patch: Record<string, unknown> = {};
    if (data.cnpj !== undefined) patch["cnpj"] = onlyDigits(data.cnpj, 14);
    if (data.inscricaoMunicipal !== undefined)
      patch["inscricao_municipal"] = data.inscricaoMunicipal || null;
    if (data.razaoSocial !== undefined) patch["razao_social"] = data.razaoSocial || null;
    if (data.codigoItemListaServico !== undefined)
      patch["codigo_item_lista_servico"] = data.codigoItemListaServico;
    if (data.codigoNbs !== undefined) patch["codigo_nbs"] = data.codigoNbs || null;
    if (data.aliquotaIss !== undefined) patch["aliquota_iss"] = data.aliquotaIss;
    if (data.situacaoTributaria !== undefined)
      patch["situacao_tributaria"] = data.situacaoTributaria;
    if (data.tributaMunicipioPrestador !== undefined)
      patch["tributa_municipio_prestador"] = data.tributaMunicipioPrestador;
    if (data.cIndOp !== undefined) patch["ibs_cbs_c_ind_op"] = data.cIndOp;
    if (data.cst !== undefined) patch["ibs_cbs_cst"] = data.cst;
    if (data.cClassTrib !== undefined) patch["ibs_cbs_c_class_trib"] = data.cClassTrib;
    if (data.modoTeste !== undefined) patch["modo_teste"] = data.modoTeste;
    if (data.simplesNacional !== undefined) patch["simples_nacional"] = data.simplesNacional;
    if (data.endpointUrl !== undefined) patch["endpoint_url"] = data.endpointUrl;

    const { data: row, error } = await context.supabase
      .from("nfse_provider_settings")
      .update(patch as never)
      .eq("brand", brand)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const senha = readSecret(secretNames(brand).senha);
    return mapSettings(row as unknown as SettingsRow, Boolean(senha));
  });

export const listRentalNfseEmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contractId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("rental_nfse_emissions")
      .select(EMISSION_COLUMNS)
      .eq("contract_id", data.contractId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as EmissionRow[]).map(mapEmission);
  });

function competenceFrom(value: string | null | undefined, fallbackIso: string | null): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const base = fallbackIso ? new Date(fallbackIso) : new Date();
  const safe = Number.isNaN(base.getTime()) ? new Date() : base;
  return `${safe.getUTCFullYear()}-${String(safe.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export const emitRentalNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { contractId: string; modoTeste?: boolean; competencia?: string | null }) => d,
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    await assertFiscalRole(supabase as unknown as AuthedSupabase, context.userId);

    const { data: contractRow, error: contractError } = await supabase
      .from("rental_contracts")
      .select(
        "id,brand,comissao_mensal,proximo_vencimento,tenant_id,property_id,rental_tenants(nome,cpf_cnpj,email,telefone,endereco),rental_properties(apelido,logradouro,numero,complemento,bairro,cidade,uf,cep)",
      )
      .eq("id", data.contractId)
      .maybeSingle();
    if (contractError) throw new Error(contractError.message);
    if (!contractRow) throw new Error("Contrato não encontrado.");

    const contract = contractRow as unknown as {
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
        bairro: string | null;
        cidade: string | null;
        cep: string | null;
      } | null;
    };

    const valor = Number(contract.comissao_mensal ?? 0);
    if (!valor || valor <= 0) {
      throw new Error(
        "Informe a comissão mensal do contrato antes de emitir a NFS-e (a nota é sobre o serviço de administração, não sobre o aluguel).",
      );
    }
    const tenant = contract.rental_tenants;
    if (!tenant) throw new Error("Locatário principal não encontrado.");
    const tomadorDoc = onlyDigits(tenant.cpf_cnpj, 14);
    if (tomadorDoc.length !== 11 && tomadorDoc.length !== 14) {
      throw new Error("Cadastre o CPF/CNPJ do locatário principal antes de emitir a NFS-e.");
    }

    const brand = normalizeNfseBrand(contract.brand);
    const { data: settingsRow, error: settingsError } = await supabase
      .from("nfse_provider_settings")
      .select("*")
      .eq("brand", brand)
      .maybeSingle();
    if (settingsError) throw new Error(settingsError.message);
    if (!settingsRow) throw new Error("Configuração fiscal não encontrada para esta marca.");
    const settings = mapSettings(settingsRow as unknown as SettingsRow, false);

    if (!onlyDigits(settings.cnpj, 14)) {
      throw new Error(
        "Configure o CNPJ do prestador (Configurações → NFS-e) antes de emitir a nota.",
      );
    }

    const modoTeste = data.modoTeste ?? settings.modoTeste;
    const competencia = competenceFrom(data.competencia, contract.proximo_vencimento);
    const mesRef = `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;
    const imovel = contract.rental_properties;
    const descritivoBase = [
      "Serviço de administração e intermediação de locação de imóvel",
      imovel?.apelido ? `Imóvel: ${imovel.apelido}` : null,
      `Competência ${mesRef}`,
    ]
      .filter(Boolean)
      .join(". ");

    const payload: NfsePayload = {
      teste: modoTeste,
      identificador: `${contract.id.slice(0, 8)}-${competencia}${modoTeste ? "-T" : ""}`,
      valor,
      descritivo: descritivoBase,
      observacao: `Competência ${mesRef}`,
      prestador: { cpfCnpj: settings.cnpj, cidadeTom: settings.cidadeTom },
      tomador: {
        tipo: inferTomadorTipo(tenant.cpf_cnpj),
        cpfCnpj: tomadorDoc,
        nomeRazaoSocial: tenant.nome,
        logradouro: tenant.endereco ?? imovel?.logradouro ?? null,
        numeroResidencia: imovel?.numero ?? null,
        bairro: imovel?.bairro ?? null,
        cidadeTom: settings.cidadeTom,
        cep: imovel?.cep ?? null,
        dddFone: onlyDigits(tenant.telefone).slice(0, 2) || null,
        fone: onlyDigits(tenant.telefone).slice(2) || null,
        email: tenant.email,
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

    const xml = buildNfseXml(payload);
    const names = secretNames(brand);
    const senha = readSecret(names.senha);
    const login = readSecret(names.login) ?? onlyDigits(settings.cnpj, 14);

    async function record(fields: Record<string, unknown>) {
      const { data: inserted, error } = await supabase
        .from("rental_nfse_emissions")
        .insert({
          contract_id: contract.id,
          brand,
          competencia,
          valor,
          modo_teste: modoTeste,
          request_xml: xml,
          created_by: context.userId,
          ...fields,
        } as never)
        .select(EMISSION_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return mapEmission(inserted as unknown as EmissionRow);
    }

    if (!senha) {
      const message = `Prévia gerada, mas o envio está bloqueado: configure a senha do webservice IPM no segredo ${names.senha} (Configurações do projeto → Secrets).`;
      const emission = await record({ status: "erro", error_message: message });
      return { emission, xml, blocked: true as const, message };
    }

    const { postNfse } = await import("./ipm/client.server");
    try {
      const result = await postNfse({
        endpointUrl: settings.endpointUrl,
        login,
        senha,
        cidade: settings.cidadeTom,
        xml,
      });
      const status = result.ok ? (modoTeste ? "teste_ok" : "emitida") : "erro";
      const errorMessage = result.ok
        ? null
        : [
            result.codigosErro.length ? `Crítica ${result.codigosErro.join(", ")}` : null,
            result.mensagem,
            `HTTP ${result.httpStatus}`,
          ]
            .filter(Boolean)
            .join(" — ");
      const emission = await record({
        status,
        numero_nfse: result.numeroNfse,
        codigo_verificador: result.codigoVerificador,
        link_pdf: result.linkPdf,
        response_raw: result.raw.slice(0, 20000),
        error_message: errorMessage,
      });
      return {
        emission,
        xml,
        blocked: false as const,
        message: result.ok
          ? modoTeste
            ? "NFS-e válida para emissão (modo teste)."
            : "NFS-e emitida com sucesso."
          : (errorMessage ?? "Retorno não reconhecido pela prefeitura."),
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao comunicar com a prefeitura.";
      const emission = await record({ status: "erro", error_message: message });
      return { emission, xml, blocked: false as const, message };
    }
  });
