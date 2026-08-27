/**
 * Normalização remoto → modelo canônico do Gestão Cordial.
 *
 * Regras: campo ausente vira `null` (nunca zero nem texto inventado) e o valor
 * original é preservado — a normalização de texto serve apenas para comparação.
 */

import type { ImobiProvider } from "./providers";

export type RemoteRecord = Record<string, unknown>;

export type NormalizedProperty = {
  externalId: string;
  externalReference: string | null;
  carteira: ImobiProvider;
  operacao: "venda" | "aluguel";
  finalidade: "venda" | "locacao" | "temporada";
  tipo: string | null;
  cidade: string | null;
  uf: string | null;
  bairro: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  localizacaoExibida: string | null;
  valor: number | null;
  valorCondominio: number | null;
  valorIptu: number | null;
  dormitorios: number | null;
  suites: number | null;
  banheiros: number | null;
  salas: number | null;
  vagas: number | null;
  acomodacoes: number | null;
  anoConstrucao: string | null;
  areaPrivativa: number | null;
  areaTotal: number | null;
  areaTerreno: number | null;
  areaConstruida: number | null;
  areaPrincipal: number | null;
  areaTipo: string | null;
  descricao: string | null;
  observacao: string | null;
  pontosFortes: string | null;
  codigo: string | null;
  exibirImovel: boolean | null;
  caracteristicas: string[];
};

export function pick(record: RemoteRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") return record[key];
  }
  return undefined;
}

export function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length ? trimmed : null;
}

/** Aceita "1.234,56", "1234.56", "1234", 1234 — retorna null para vazio/inválido. */
export function parseDecimal(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === ",") return null;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  let normalized = cleaned;
  if (hasComma && hasDot) {
    normalized = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (hasComma) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseInteger(value: unknown): number | null {
  const parsed = parseDecimal(value);
  if (parsed === null) return null;
  return Math.trunc(parsed);
}

export function parseBool(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  const raw = String(value).trim().toLowerCase();
  if (["sim", "s", "1", "true", "ativo", "publicado"].includes(raw)) return true;
  if (["nao", "não", "n", "0", "false", "inativo"].includes(raw)) return false;
  return null;
}

/** Chave de comparação: sem acento, sem pontuação, minúscula. Não substitui o valor original. */
export function normalizeKey(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeFinalidade(value: unknown): "venda" | "locacao" | "temporada" {
  const raw = normalizeKey(text(value));
  if (raw.includes("tempor")) return "temporada";
  if (raw.includes("loca") || raw.includes("alug")) return "locacao";
  return "venda";
}

/** Endereço pode voltar como objeto, array de objetos ou campos soltos na raiz. */
export function flattenAddress(record: RemoteRecord): RemoteRecord {
  const candidates: unknown[] = [
    record["endereco"],
    record["Endereco"],
    record["localizacao"],
    record["enderecoImovel"],
  ];
  const merged: RemoteRecord = {};
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        if (item && typeof item === "object") Object.assign(merged, item as RemoteRecord);
      }
    } else if (candidate && typeof candidate === "object") {
      Object.assign(merged, candidate as RemoteRecord);
    }
  }
  return { ...merged, ...record };
}

export function extractCharacteristics(record: RemoteRecord): string[] {
  const raw = record["caracteristicas"] ?? record["caracteristica"] ?? record["Caracteristicas"];
  const out: string[] = [];
  const push = (value: unknown) => {
    const label = text(value);
    if (label) out.push(label);
  };
  const walk = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value === "object") {
      const record2 = value as RemoteRecord;
      const label = pick(record2, ["descricao", "nome", "caracteristica", "label", "titulo"]);
      if (label) push(label);
      else for (const nested of Object.values(record2)) walk(nested);
      return;
    }
    push(value);
  };
  walk(raw);
  return Array.from(new Set(out));
}

export function normalizeRemoteProperty(
  provider: ImobiProvider,
  externalId: string,
  raw: RemoteRecord,
): NormalizedProperty {
  const record = flattenAddress(raw);
  const finalidade = normalizeFinalidade(pick(record, ["finalidade", "finalidadeImovel", "transacao"]));
  const areaPrivativa = parseDecimal(pick(record, ["areaPrivativa", "area_privativa", "areaUtil"]));
  const areaTotal = parseDecimal(pick(record, ["areaTotal", "area_total"]));
  const areaTerreno = parseDecimal(pick(record, ["areaTerreno", "area_terreno"]));
  const areaConstruida = parseDecimal(pick(record, ["areaConstruida", "area_construida"]));
  const areaPrincipal = areaPrivativa ?? areaTotal ?? areaConstruida ?? areaTerreno;
  const areaTipo =
    areaPrivativa !== null
      ? "privativa"
      : areaTotal !== null
        ? "total"
        : areaConstruida !== null
          ? "construida"
          : areaTerreno !== null
            ? "terreno"
            : null;

  const bairro = text(pick(record, ["bairro", "nomeBairro", "bairroImovel"]));
  const cidade = text(pick(record, ["cidade", "nomeCidade", "cidadeImovel", "municipio"]));
  const uf = text(pick(record, ["uf", "estado", "siglaEstado"]));

  return {
    externalId,
    externalReference: text(pick(record, ["referenciaImovel", "referencia", "codigoReferencia"])),
    carteira: provider,
    operacao: finalidade === "venda" ? "venda" : "aluguel",
    finalidade,
    tipo: text(pick(record, ["tipoImovel", "tipo", "nomeTipo", "descricaoTipo"])),
    cidade,
    uf: uf ? uf.slice(0, 2).toUpperCase() : null,
    bairro,
    cep: text(pick(record, ["cep", "CEP"])),
    logradouro: text(pick(record, ["logradouro", "rua", "endereco_rua"])),
    numero: text(pick(record, ["numero", "numeroImovel"])),
    complemento: text(pick(record, ["complemento"])),
    localizacaoExibida: [bairro, [cidade, uf].filter(Boolean).join(" / ")].filter(Boolean).join(" · ") || null,
    valor: parseDecimal(pick(record, ["valorImovel", "valor", "valorVenda", "valorLocacao", "preco"])),
    valorCondominio: parseDecimal(pick(record, ["valorCondominio", "condominio"])),
    valorIptu: parseDecimal(pick(record, ["valorIptu", "iptu"])),
    dormitorios: parseInteger(pick(record, ["dormitorios", "quartos", "dormitorio"])),
    suites: parseInteger(pick(record, ["suites", "suite"])),
    banheiros: parseInteger(pick(record, ["banheiros", "banheiro", "wc"])),
    salas: parseInteger(pick(record, ["salas", "sala"])),
    vagas: parseInteger(pick(record, ["garagem", "vagas", "garagens"])),
    acomodacoes: parseInteger(pick(record, ["acomodacoes"])),
    anoConstrucao: text(pick(record, ["anoConstrucao", "ano"])),
    areaPrivativa,
    areaTotal,
    areaTerreno,
    areaConstruida,
    areaPrincipal,
    areaTipo,
    descricao: text(pick(record, ["descricaoImovel", "descricao"])),
    observacao: text(pick(record, ["observacaoImovel", "observacao", "obs"])),
    pontosFortes: text(pick(record, ["pontosFortes", "pontoForte"])),
    codigo: text(pick(record, ["codigoImovel", "codigo"])) ?? externalId,
    exibirImovel: parseBool(pick(record, ["exibirImovel", "exibir", "situacao", "status"])),
    caracteristicas: extractCharacteristics(record),
  };
}

/** Linha pronta para upsert em `properties`. */
export function toPropertyRow(normalized: NormalizedProperty) {
  return {
    carteira: normalized.carteira,
    operacao: normalized.operacao,
    finalidade: normalized.finalidade,
    tipo: normalized.tipo,
    localizacao_exibida: normalized.localizacaoExibida,
    bairro: normalized.bairro,
    cidade: normalized.cidade,
    uf: normalized.uf,
    cep: normalized.cep,
    logradouro: normalized.logradouro,
    numero: normalized.numero,
    complemento: normalized.complemento,
    valor: normalized.valor,
    valor_modo: normalized.valor === null ? "consulte" : "fixo",
    valor_condominio: normalized.valorCondominio,
    valor_iptu: normalized.valorIptu,
    dormitorios: normalized.dormitorios,
    suites: normalized.suites,
    banheiros: normalized.banheiros,
    salas: normalized.salas,
    vagas: normalized.vagas,
    acomodacoes: normalized.acomodacoes,
    ano_construcao: normalized.anoConstrucao,
    area_privativa: normalized.areaPrivativa,
    area_total: normalized.areaTotal,
    area_terreno: normalized.areaTerreno,
    area_construida: normalized.areaConstruida,
    area_principal: normalized.areaPrincipal,
    area_tipo: normalized.areaTipo,
    descricao_imovel: normalized.descricao,
    observacao_imovel: normalized.observacao,
    pontos_fortes: normalized.pontosFortes,
    codigo: normalized.codigo,
    referencia: normalized.externalReference,
    exibir_imovel: normalized.exibirImovel ?? true,
  };
}

export type ImportImage = {
  externalImageId: string | null;
  url: string;
  isCover: boolean;
  position: number;
};

export function normalizeRemoteImages(records: RemoteRecord[]): ImportImage[] {
  const images: ImportImage[] = [];
  records.forEach((record, index) => {
    const url = text(pick(record, ["url", "urlImagem", "imagem", "link", "arquivo", "src"]));
    if (!url || !/^https?:\/\//i.test(url)) return;
    images.push({
      externalImageId: text(pick(record, ["codigoImagem", "id", "codigo"])),
      url,
      isCover: parseBool(pick(record, ["destaque", "principal", "capa"])) === true,
      position: parseInteger(pick(record, ["ordem", "posicao"])) ?? index,
    });
  });
  if (images.length && !images.some((image) => image.isCover)) {
    images[0]!.isCover = true;
  }
  return images.sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.position - b.position);
}
