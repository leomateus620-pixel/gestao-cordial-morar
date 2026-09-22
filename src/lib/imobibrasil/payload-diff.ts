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

/**
 * Lê número em formato CONHECIDO, sem adivinhar:
 *  - número nativo: preserva a parte decimal (10.5 continua 10.5);
 *  - "1.500,50" / "1500,5" → vírgula decimal (padrão brasileiro);
 *  - "1.500" / "1.500.000" → ponto de milhar (grupos de 3);
 *  - "1500.50" → ponto decimal (1 ou 2 casas, sem vírgula);
 *  - identificadores com zero à esquerda ("0123") NÃO viram número.
 * Qualquer outro texto retorna null e é comparado como texto.
 */
export function parseKnownNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!text) return null;
  if (/^-?0\d/.test(text)) return null;
  let normalized: string | null = null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) normalized = text.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d+$/.test(text)) normalized = text.replace(",", ".");
  else if (/^-?\d+(\.\d{1,2})?$/.test(text)) normalized = text;
  else if (/^-?\d+\.\d+$/.test(text)) normalized = text;
  if (normalized === null) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeScalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "sim" : "nao";
  const text = String(value).trim();
  if (!text) return "";
  const parsed = parseKnownNumber(value);
  // Centavos inteiros evitam erro de ponto flutuante em valores monetários.
  if (parsed !== null) return `#${Math.round(parsed * 100)}`;
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

  // Descrição: a leitura devolve HTML; guardamos a forma comparável.
  if (typeof source["descricaoImovel"] === "string" || source["descricaoImovel"] === null) {
    put("descricaoImovel", normalizeRichText(source["descricaoImovel"]));
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

/** Campos de texto rico que o site devolve em HTML (e às vezes com acentos em dupla codificação). */
export const RICH_TEXT_KEYS = new Set(["descricaoImovel"]);

/**
 * Texto comparável da descrição: quebras e `<br>` viram quebra única, entidades
 * numéricas/nomeadas são decodificadas, acentos em dupla codificação (UTF-8 lido
 * como Latin-1, ex.: "localizaÃ§Ã£o") são reparados e espaços são consolidados.
 * Só serve para COMPARAR — nunca para gravar.
 */
export function normalizeRichText(value: unknown): string {
  let text = String(value ?? "");
  if (/Ã.|Â./.test(text)) {
    try {
      const bytes = Uint8Array.from(Array.from(text, (ch) => ch.charCodeAt(0) & 0xff));
      const repaired = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      text = repaired;
    } catch {
      // não era dupla codificação; mantém
    }
  }
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Vínculo confiável? `0`, vazio ou ausente significa desconhecido — nunca zero. */
export function isKnownLink(value: unknown): boolean {
  const text = String(value ?? "").trim();
  return Boolean(text) && text !== "0";
}
