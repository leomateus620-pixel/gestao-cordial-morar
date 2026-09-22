/**
 * Alteração mínima na ImobiBrasil (puro, sem I/O — testável).
 *
 * Contrato oficial (`/api/v1/doc/api.json`, conferido em 22/09/2026):
 *   "Alteração parcial: além dos obrigatórios (finalidade e codigoTipoImovel),
 *    só os campos enviados no corpo são gravados; os que não vierem continuam
 *    como estão no imóvel. Campo enviado vazio ou null é gravado vazio."
 *
 * Portanto: OMITIR PRESERVA, VAZIO LIMPA. O envio do cadastro inteiro (o que o
 * Gestão fazia até 10/09/2026) é justamente o que apagava dados no site quando
 * um campo local estava vazio ou desconhecido. Aqui montamos o corpo com a
 * diferença em relação ao último envio confirmado.
 */

import type { ImobiPayload } from "./serializers";

/** Sempre presentes no corpo da alteração — exigência do contrato + identidade. */
export const REQUIRED_UPDATE_KEYS = ["finalidade", "codigoTipoImovel", "referencia"] as const;

/** Vínculos de pessoas: nunca entram sem alteração explícita. */
export const PERSON_LINK_KEYS = [
  "codigoProprietario",
  "codigoCorretor",
  "codigoUsuarioAdicional",
] as const;

export type PayloadSnapshot = Record<string, unknown>;

/** Comparação tolerante: "1.500" == "1500", "10,00" == "10", "Sim" == "sim". */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const left = (Array.isArray(a) ? a : [a]).map((item) => String(item ?? "").trim());
    const right = (Array.isArray(b) ? b : [b]).map((item) => String(item ?? "").trim());
    return left.length === right.length && left.every((item, index) => item === right[index]);
  }
  return normalizeScalar(a) === normalizeScalar(b);
}

function normalizeScalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "sim" : "nao";
  const text = String(value).trim();
  if (!text) return "";
  const numeric = text.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (/^-?\d+(\.\d+)?$/.test(numeric)) {
    const parsed = Number(numeric);
    if (Number.isFinite(parsed)) return String(parsed);
  }
  return text.toLowerCase();
}

export type MinimalUpdate = {
  /** Corpo a enviar: só o que mudou + os obrigatórios do contrato. */
  payload: ImobiPayload;
  /** Campos realmente alterados (fora dos obrigatórios). */
  changedKeys: string[];
  /** Vínculos deixados de fora de propósito (omitir preserva no site). */
  preservedLinks: string[];
};

export type MinimalUpdateOptions = {
  /**
   * Vínculos com alteração explícita pedida pelo usuário. Fora desta lista, os
   * códigos de proprietário/corretor/usuário adicional nunca são enviados.
   */
  personLinkChanges?: string[];
};

/**
 * Monta a alteração mínima a partir do corpo completo e do último corpo
 * confirmado. Chave ausente do snapshot conta como "desconhecida": entra uma
 * única vez com o valor local correto — nunca é apagada por omissão.
 */
export function buildMinimalUpdate(
  full: ImobiPayload,
  snapshot: PayloadSnapshot | null | undefined,
  options: MinimalUpdateOptions = {},
): MinimalUpdate {
  const required = new Set<string>(REQUIRED_UPDATE_KEYS);
  const linkChanges = new Set(options.personLinkChanges ?? []);
  const payload: ImobiPayload = {};
  const changedKeys: string[] = [];
  const preservedLinks: string[] = [];

  for (const [key, value] of Object.entries(full)) {
    if (value === undefined) continue;

    if ((PERSON_LINK_KEYS as readonly string[]).includes(key) && !linkChanges.has(key)) {
      preservedLinks.push(key);
      continue;
    }

    if (required.has(key)) {
      payload[key] = value;
      if (snapshot && !sameValue(snapshot[key], value)) changedKeys.push(key);
      continue;
    }

    if (snapshot && sameValue(snapshot[key], value)) continue;

    payload[key] = value;
    changedKeys.push(key);
  }

  return { payload, changedKeys, preservedLinks };
}

/** Nada mudou de fato: não vale gastar uma escrita externa. */
export function hasEffectiveChange(update: MinimalUpdate): boolean {
  return update.changedKeys.length > 0;
}

const BOOL_KEYS: Array<[remote: string, payloadKey: string]> = [
  ["exibirImovel", "exibirImovel"],
  ["exibirCorretor", "exibirCorretor"],
  ["destaqueInicial", "destaqueInicial"],
  ["destaquesSuperDestaqueInicial", "destaquesSuperDestaqueInicial"],
  ["disponibilizarExportacao", "disponibilizarExportacao"],
  ["emCondominio", "emCondominio"],
  ["exclusividade", "exclusividade"],
  ["autorizacao", "autorizacao"],
  ["averbada", "averbada"],
  ["escriturada", "escriturada"],
  ["aceitaFinanciamento", "aceitaFinanciamento"],
  ["comPlaca", "comPlaca"],
  ["permuta", "permuta"],
  ["dispararPeriodico", "dispararPeriodico"],
  ["mobiliado", "mobiliado"],
];

const TEXT_KEYS: Array<[remote: string, payloadKey: string]> = [
  ["referenciaImovel", "referencia"],
  ["anoConstrucao", "anoConstrucao"],
  ["pavimento", "pavimento"],
  ["tarjaImagem", "tarjaImagem"],
  ["localChave", "localChave"],
  ["origemCaptacao", "origemCaptacao"],
  ["video", "video"],
  ["tourVirtual", "tourVirtual"],
  ["seoURL", "seoURL"],
  ["seoTitulo", "seoTitulo"],
  ["seoDescricao", "seoDescricao"],
  ["disponibilidade", "disponibilidade"],
  ["valorObservacoes", "valorObservacao"],
  ["pontosFortesImovel", "pontosFortesImovel"],
];

const NUMBER_KEYS: Array<[remote: string, payloadKey: string]> = [
  ["dormitorios", "dormitorios"],
  ["suites", "suites"],
  ["banheiros", "banheiros"],
  ["salas", "salas"],
  ["garagem", "garagem"],
  ["acomodacoes", "acomodacoes"],
  ["valorEsperado", "valorImovel"],
  ["valorIPTU", "valorIPTU"],
  ["valorCondominio", "valorCondominio"],
  ["valorTaxas", "valorTaxas"],
];

const ADDRESS_KEYS = [
  "cep",
  "bairro",
  "logradouro",
  "numero",
  "complemento",
  "pontoReferencia",
  "zona",
  "regiao",
] as const;

/**
 * Primeira alteração de um imóvel antigo (sem snapshot local): o ponto de
 * partida é o que o SITE responde, nunca valores padrão. Campos que a resposta
 * não descreve de forma confiável ficam fora do snapshot — e por isso entram
 * uma vez com o valor local, jamais vazios.
 */
export function remoteToPayloadSnapshot(remote: unknown): PayloadSnapshot {
  const root = (remote ?? {}) as Record<string, unknown>;
  const candidate = (root["resultSet"] ?? root["data"] ?? root) as unknown;
  const source = (Array.isArray(candidate) ? (candidate[0] ?? {}) : (candidate ?? {})) as Record<
    string,
    unknown
  >;
  const snapshot: PayloadSnapshot = {};

  const put = (key: string, value: unknown) => {
    if (value === undefined) return;
    snapshot[key] = value;
  };

  for (const [remoteKey, payloadKey] of BOOL_KEYS) {
    const value = source[remoteKey];
    if (typeof value === "boolean") put(payloadKey, value ? "sim" : "nao");
  }
  for (const [remoteKey, payloadKey] of TEXT_KEYS) {
    if (!(remoteKey in source)) continue;
    const value = source[remoteKey];
    put(payloadKey, value === null || value === undefined ? "" : String(value).trim());
  }
  for (const [remoteKey, payloadKey] of NUMBER_KEYS) {
    if (!(remoteKey in source)) continue;
    const value = Number(source[remoteKey] ?? 0);
    if (!Number.isFinite(value)) continue;
    put(payloadKey, value > 0 ? String(value) : "");
  }

  const endereco = (source["endereco"] ?? {}) as Record<string, unknown>;
  for (const key of ADDRESS_KEYS) {
    if (!(key in endereco)) continue;
    const value = endereco[key];
    put(key, value === null || value === undefined ? "" : String(value).trim());
  }

  const area = (source["area"] ?? {}) as Record<string, unknown>;
  const areaPairs: Array<[string, string]> = [
    ["privativa", "areaPrivativa"],
    ["total", "areaTotal"],
    ["terreno", "areaTerreno"],
    ["construida", "areaConstruida"],
  ];
  for (const [remoteKey, payloadKey] of areaPairs) {
    const entry = area[remoteKey] as Record<string, unknown> | undefined;
    if (!entry || !("valor" in entry)) continue;
    const value = entry["valor"];
    put(payloadKey, value === null || value === undefined ? "" : String(value).trim());
  }

  return snapshot;
}

/** Vínculo confiável? `0`, vazio ou ausente significa desconhecido — nunca zero. */
export function isKnownLink(value: unknown): boolean {
  const text = String(value ?? "").trim();
  return Boolean(text) && text !== "0";
}
