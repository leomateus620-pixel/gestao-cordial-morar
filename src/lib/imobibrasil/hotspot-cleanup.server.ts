/**
 * Acompanhamento da limpeza do campo público "pontos fortes" nos sites.
 *
 * Server-only e SOMENTE LEITURA na API (GET /imovel/dados). Nenhuma função
 * deste arquivo chama `/imovel/alterar`, nenhum POST/PUT/DELETE externo é
 * emitido e a pausa de segurança das atualizações cadastrais não é consultada
 * nem alterada.
 */

import { fetchPropertyDetail } from "./read.server";
import { resolveProviderCodes } from "./catalogs.server";
import {
  hasInternalSiteNotes,
  serializeProperty,
  stripInternalSiteNotes,
  type LocalPropertyForSync,
} from "./serializers";
import type { ImobiProvider } from "./providers";

type Admin = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

/** Campos que mudam sozinhos no site e não indicam alteração de conteúdo. */
const VOLATILE_REMOTE_KEYS = new Set([
  "atualizadoEm",
  "revisaoData",
  "dataInserido",
  "cadastradoEm",
]);

/** Conserta texto UTF-8 devolvido pela API como latin1 ("comissÃ£o" → "comissão"). */
export function fixMojibake(value: string): string {
  if (!/[ÃÂ][\x80-\xbf]/.test(value)) return value;
  try {
    const bytes = Uint8Array.from(Array.from(value, (c) => c.charCodeAt(0) & 0xff));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return value;
  }
}

/** Texto comparável: sem HTML, sem acento, minúsculo, espaços normalizados. */
export function normalizeForCompare(value: string | null | undefined): string {
  if (!value) return "";
  return fixMojibake(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export function remoteRecordOf(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const root = payload as Record<string, unknown>;
  const set = (root["resultSet"] ?? root["data"] ?? root) as unknown;
  if (Array.isArray(set)) return (set[0] ?? {}) as Record<string, unknown>;
  return (set ?? {}) as Record<string, unknown>;
}

/** Texto do site em linhas legíveis (sem HTML), como exibido na tela de limpeza. */
export function remotePontosFortes(record: Record<string, unknown>): string {
  for (const key of ["pontosFortesImovel", "pontosFortes"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return fixMojibake(value)
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("\n");
    }
  }
  return "";
}

/**
 * Texto que deve permanecer no site: apenas as linhas legítimas do campo
 * público local. Sem conteúdo legítimo, o site deve ficar vazio.
 */
export function expectedFinalText(localPontosFortes: string | null | undefined): string {
  return stripInternalSiteNotes(localPontosFortes) ?? "";
}

export type CleanupClassification = "somente_interno" | "misto" | "incerto";

export function classify(
  remoteText: string,
  localPublic: string | null | undefined,
): CleanupClassification {
  const lines = normalizeForCompare(remoteText)
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (!lines.length) return "incerto";
  const internal = lines.filter((line) => hasInternalSiteNotes(line));
  const legit = lines.filter((line) => !hasInternalSiteNotes(line));
  if (!internal.length) return "incerto";
  if (!legit.length) return "somente_interno";
  // Linha legítima remota que não existe no texto público local: não sabemos
  // dizer sozinhos o que deve sobrar no site.
  const localLines = new Set(
    normalizeForCompare(localPublic)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const orphan = legit.some((line) => !localLines.has(line.trim()));
  return orphan ? "incerto" : "misto";
}

export type CheckResult = {
  ok: boolean;
  internalGone: boolean;
  legitPreserved: boolean;
  otherFieldsUntouched: boolean;
  changedFields: string[];
  remotePontosFortes: string;
  expectedFinal: string;
  checkedAt: string;
};

/** Reconferência por GET de um anúncio já limpo manualmente no painel do site. */
export async function recheckRemote(params: {
  provider: ImobiProvider;
  externalId: string;
  expectedFinal: string;
  snapshot: Record<string, unknown> | null;
  correlationId?: string;
}): Promise<{ result: CheckResult; record: Record<string, unknown> }> {
  const response = await fetchPropertyDetail(
    params.provider,
    params.externalId,
    params.correlationId,
  );
  const record = remoteRecordOf(response);
  const remoteText = remotePontosFortes(record);
  const internalGone = !hasInternalSiteNotes(remoteText);
  const expected = normalizeForCompare(params.expectedFinal);
  const actual = normalizeForCompare(remoteText);
  const legitPreserved = expected.length === 0 ? actual.length === 0 : actual.includes(expected);

  const changedFields: string[] = [];
  if (params.snapshot) {
    const before = params.snapshot;
    const keys = new Set([...Object.keys(before), ...Object.keys(record)]);
    for (const key of keys) {
      if (key === "pontosFortesImovel" || key === "pontosFortes") continue;
      if (VOLATILE_REMOTE_KEYS.has(key)) continue;
      if (JSON.stringify(before[key] ?? null) !== JSON.stringify(record[key] ?? null)) {
        changedFields.push(key);
      }
    }
  }

  const result: CheckResult = {
    ok: internalGone && legitPreserved && changedFields.length === 0,
    internalGone,
    legitPreserved,
    otherFieldsUntouched: changedFields.length === 0,
    changedFields,
    remotePontosFortes: remoteText,
    expectedFinal: params.expectedFinal,
    checkedAt: new Date().toISOString(),
  };
  return { result, record };
}

export type DryRunFieldStatus = "igual" | "seria_alterado" | "ficaria_vazio" | "nao_reconstruivel";

export type DryRunField = {
  field: string;
  status: DryRunFieldStatus;
  remote: string;
  payload: string;
};

export type DryRunReport = {
  propertyId: string;
  provider: ImobiProvider;
  externalId: string;
  /** Sempre falso neste arquivo: nenhum POST é executado em nenhuma hipótese. */
  executed: false;
  verdict: "seguro_somente_pontos_fortes" | "nao_executar";
  reasons: string[];
  fields: DryRunField[];
  ownerLink: { remote: string; payload: string; status: DryRunFieldStatus };
  brokerLink: { remote: string; payload: string; status: DryRunFieldStatus };
  photos: { remoteCount: number; remoteCoverUrl: string | null; payloadTouchesPhotos: false };
  generatedAt: string;
};

/** Pares payload → campo remoto equivalente (nomes divergem na API). */
const FIELD_MAP: Record<string, string> = {
  pontosFortesImovel: "pontosFortesImovel",
  descricaoImovel: "descricaoImovel",
  valorImovel: "valorEsperado",
  valorIPTU: "valorIPTU",
  valorCondominio: "valorCondominio",
  valorTaxas: "valorTaxas",
  dormitorios: "dormitorios",
  suites: "suites",
  banheiros: "banheiros",
  salas: "salas",
  garagem: "garagem",
  acomodacoes: "acomodacoes",
  mobiliado: "mobiliado",
  referencia: "referenciaImovel",
  codigoProprietario: "codigoProprietario",
  codigoCorretor: "codigoCorretor",
  codigoUsuarioAdicional: "codigoUsuarioAdicional",
  disponibilidade: "disponibilidade",
  origemCaptacao: "origemCaptacao",
  localChave: "localChave",
  video: "video",
  tourVirtual: "tourVirtual",
  seoURL: "seoURL",
  seoTitulo: "seoTitulo",
  seoDescricao: "seoDescricao",
};

const ADDRESS_MAP: Record<string, string> = {
  cep: "cep",
  bairro: "bairro",
  logradouro: "logradouro",
  numero: "numero",
  complemento: "complemento",
  pontoReferencia: "pontoReferencia",
  zona: "zona",
  regiao: "regiao",
};

const BOOL_REMOTE: Record<string, string> = {
  exibirImovel: "exibirImovel",
  exibirCorretor: "exibirCorretor",
  destaqueInicial: "destaqueInicial",
  destaquesSuperDestaqueInicial: "destaquesSuperDestaqueInicial",
  disponibilizarExportacao: "disponibilizarExportacao",
  emCondominio: "emCondominio",
  exclusividade: "exclusividade",
  autorizacao: "autorizacao",
  averbada: "averbada",
  escriturada: "escriturada",
  aceitaFinanciamento: "aceitaFinanciamento",
  comPlaca: "comPlaca",
  permuta: "permuta",
  dispararPeriodico: "dispararPeriodico",
};

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "sim" : "nao";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return fixMojibake(value);
  return JSON.stringify(value);
}

function sameValue(payload: string, remote: string): boolean {
  const a = normalizeForCompare(payload);
  const b = normalizeForCompare(remote);
  if (a === b) return true;
  const numA = Number(a.replace(/\./g, "").replace(",", "."));
  const numB = Number(b.replace(/\./g, "").replace(",", "."));
  if (Number.isFinite(numA) && Number.isFinite(numB)) return numA === numB;
  return false;
}

/**
 * Auditoria em dry-run: monta o corpo que `/imovel/alterar` receberia hoje e
 * compara campo a campo com o anúncio atual. NÃO envia nada.
 */
export async function buildDryRunReport(
  admin: Admin,
  propertyId: string,
  provider: ImobiProvider,
  externalId: string,
): Promise<DryRunReport> {
  const { data: property, error } = await admin
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!property) throw new Error("Imóvel não encontrado.");

  const { data: publication } = await admin
    .from("property_provider_publications")
    .select("*")
    .eq("property_id", propertyId)
    .eq("provider", provider)
    .maybeSingle();

  const resolution = await resolveProviderCodes(admin as never, provider, property);
  const payload = serializeProperty(
    property as LocalPropertyForSync,
    {
      ...resolution.codes,
      codigoProprietario:
        resolution.codes.codigoProprietario ?? publication?.remote_codigo_proprietario ?? null,
      codigoCorretor: resolution.codes.codigoCorretor ?? publication?.remote_codigo_corretor ?? null,
      codigoUsuarioAdicional:
        resolution.codes.codigoUsuarioAdicional ??
        publication?.remote_codigo_usuario_adicional ??
        null,
    },
    { mode: "update" },
  );

  const response = await fetchPropertyDetail(provider, externalId);
  const record = remoteRecordOf(response);
  const endereco = (record["endereco"] ?? {}) as Record<string, unknown>;
  const imagens = Array.isArray(record["imagens"]) ? (record["imagens"] as any[]) : [];

  const fields: DryRunField[] = [];
  const pushField = (field: string, payloadValue: unknown, remoteValue: unknown) => {
    const payloadText = asText(payloadValue);
    const remoteText = asText(remoteValue);
    let status: DryRunFieldStatus;
    if (sameValue(payloadText, remoteText)) status = "igual";
    else if (!payloadText.trim() && remoteText.trim()) status = "ficaria_vazio";
    else status = "seria_alterado";
    fields.push({ field, status, remote: remoteText, payload: payloadText });
  };

  for (const [payloadKey, remoteKey] of Object.entries(FIELD_MAP)) {
    pushField(payloadKey, payload[payloadKey], record[remoteKey]);
  }
  for (const [payloadKey, remoteKey] of Object.entries(ADDRESS_MAP)) {
    pushField(payloadKey, payload[payloadKey], endereco[remoteKey]);
  }
  for (const [payloadKey, remoteKey] of Object.entries(BOOL_REMOTE)) {
    pushField(payloadKey, payload[payloadKey], record[remoteKey]);
  }

  // Áreas e características: a API devolve estruturas aninhadas/rotuladas que
  // não conseguimos reconstruir com garantia a partir do cadastro local.
  const area = (record["area"] ?? {}) as Record<string, any>;
  for (const [payloadKey, remoteValue] of [
    ["areaPrivativa", area["privativa"]?.valor],
    ["areaTotal", area["total"]?.valor],
    ["areaTerreno", area["terreno"]?.valor],
    ["areaConstruida", area["construida"]?.valor],
  ] as Array<[string, unknown]>) {
    pushField(payloadKey, payload[payloadKey], remoteValue);
  }
  const caracteristicas = Array.isArray(record["caracteristicas"])
    ? (record["caracteristicas"] as any[])
    : [];
  fields.push({
    field: "caracteristicas",
    status: "nao_reconstruivel",
    remote: `${caracteristicas.length} característica(s) no site`,
    payload: "não enviado pelo Gestão",
  });
  fields.push({
    field: "exibirEnderecoSite",
    status: "nao_reconstruivel",
    remote: JSON.stringify(record["exibirEnderecoSite"] ?? null),
    payload: asText(payload["exibirEnderecoSite"]),
  });

  const ownerRemote = asText(record["codigoProprietario"]);
  const ownerPayload = asText(payload["codigoProprietario"]);
  const brokerRemote = asText(record["codigoCorretor"]);
  const brokerPayload = asText(payload["codigoCorretor"]);
  const linkStatus = (remote: string, sent: string): DryRunFieldStatus => {
    if (remote === "0" || remote === "") return sent ? "seria_alterado" : "igual";
    if (!sent) return "ficaria_vazio";
    return sameValue(sent, remote) ? "igual" : "seria_alterado";
  };

  const reasons: string[] = [];
  const risky = fields.filter(
    (f) => f.field !== "pontosFortesImovel" && f.status !== "igual",
  );
  for (const field of risky) reasons.push(`${field.field}: ${field.status}`);
  const ownerStatus = linkStatus(ownerRemote, ownerPayload);
  const brokerStatus = linkStatus(brokerRemote, brokerPayload);
  if (ownerStatus !== "igual") reasons.push(`codigoProprietario: ${ownerStatus}`);
  if (brokerStatus !== "igual") reasons.push(`codigoCorretor: ${brokerStatus}`);

  return {
    propertyId,
    provider,
    externalId,
    executed: false,
    verdict: reasons.length ? "nao_executar" : "seguro_somente_pontos_fortes",
    reasons,
    fields,
    ownerLink: { remote: ownerRemote, payload: ownerPayload, status: ownerStatus },
    brokerLink: { remote: brokerRemote, payload: brokerPayload, status: brokerStatus },
    photos: {
      remoteCount: imagens.length,
      remoteCoverUrl:
        (imagens.find((img) => img?.destaque)?.url as string | undefined) ??
        (imagens[0]?.url as string | undefined) ??
        null,
      payloadTouchesPhotos: false,
    },
    generatedAt: new Date().toISOString(),
  };
}
