/**
 * Parsers puros das respostas de leitura da ImobiBrasil.
 * Sem I/O — separados do client para poderem ser testados isoladamente.
 */

export type RemoteRecord = Record<string, unknown>;

export type RemotePage = {
  items: RemoteRecord[];
  page: number;
  perPage: number;
  totalPages: number;
  totalItems: number;
  /** Falso quando o corpo não tem nenhum formato de lista conhecido: leitura inconclusiva, nunca "vazio". */
  recognized?: boolean;
  /** Verdadeiro só quando o site informou o total de páginas. */
  totalPagesKnown?: boolean;
};

function asRecord(value: unknown): RemoteRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RemoteRecord) : null;
}

function toInt(value: unknown, fallback: number): number {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

/** A API alterna entre `resultSet`, `data` e array puro — o extrator é tolerante. */
export function extractPage(payload: unknown, requestedPage: number, requestedPerPage: number): RemotePage {
  if (Array.isArray(payload)) {
    const items = payload.filter((item): item is RemoteRecord => !!asRecord(item));
    return {
      items,
      page: requestedPage,
      perPage: requestedPerPage,
      totalPages: requestedPage,
      totalItems: items.length,
      recognized: items.length === payload.length,
      // Array puro não diz quantas páginas existem: fim só por página incompleta.
      totalPagesKnown: false,
    };
  }

  const root = asRecord(payload) ?? {};
  const resultSet = asRecord(root["resultSet"]) ?? root;

  const listCandidate =
    (Array.isArray(resultSet["data"]) && resultSet["data"]) ||
    (Array.isArray(resultSet["total_data"]) && resultSet["total_data"]) ||
    (Array.isArray(root["data"]) && root["data"]) ||
    (Array.isArray(root["imoveis"]) && root["imoveis"]) ||
    null;
  const rawItems = listCandidate ?? [];
  const totalPagesRaw = resultSet["total_pages"] ?? root["total_pages"];

  const items = (rawItems as unknown[]).filter((item): item is RemoteRecord => !!asRecord(item));

  return {
    items,
    page: toInt(resultSet["page"] ?? root["page"], requestedPage),
    perPage: toInt(resultSet["per_page"] ?? root["per_page"], requestedPerPage),
    totalPages: toInt(resultSet["total_pages"] ?? root["total_pages"], items.length ? requestedPage : 0),
    totalItems: toInt(resultSet["total_items"] ?? root["total_items"], items.length),
    recognized: listCandidate !== null && items.length === rawItems.length,
    totalPagesKnown: totalPagesRaw !== undefined && totalPagesRaw !== null && toInt(totalPagesRaw, -1) > 0,
  };
}

/** Desembrulha `{ status, resultSet: {...} }` de um recurso singular. */
export function extractRecord(payload: unknown): RemoteRecord {
  const root = asRecord(payload);
  if (!root) return {};
  const resultSet = root["resultSet"];
  if (Array.isArray(resultSet)) return asRecord(resultSet[0]) ?? {};
  const inner = asRecord(resultSet) ?? asRecord(root["data"]) ?? asRecord(root["imovel"]);
  return inner ?? root;
}

export function extractList(payload: unknown): RemoteRecord[] {
  if (Array.isArray(payload)) {
    const records = payload.filter((i): i is RemoteRecord => !!asRecord(i));
    if (records.length !== payload.length) throw new Error("Lista de imagens com itens sem formato reconhecível.");
    return records;
  }
  const root = asRecord(payload) ?? {};
  if ("codigoImagem" in root && "url" in root) return [root];
  for (const key of ["resultSet", "data", "imagens", "total_data"]) {
    const value = root[key];
    if (Array.isArray(value)) return extractList(value);
    const nested = asRecord(value);
    if (nested) {
      for (const nestedKey of ["data", "total_data", "imagens", "resultSet"]) {
        if (Array.isArray(nested[nestedKey])) return extractList(nested[nestedKey]);
      }
      if ("codigoImagem" in nested && "url" in nested) return [nested];
    }
  }
  throw new Error("Resposta de imagens sem lista reconhecível; vazio não foi confirmado.");
}

/** A documentação da lista de imagens prevê página/per_page, mas também
 * descreve resultSet como objeto singular. Aceitamos ambos sem converter um
 * formato desconhecido em galeria vazia. */
export function extractImagePage(payload: unknown, requestedPage: number, requestedPerPage: number): RemotePage {
  const page = extractPage(payload, requestedPage, requestedPerPage);
  if (page.recognized) return page;
  const items = extractList(payload);
  return {
    items, page: requestedPage, perPage: requestedPerPage,
    totalItems: items.length, totalPages: requestedPage,
    recognized: true, totalPagesKnown: false,
  };
}

/** Uma resposta de sucesso sem campos do imóvel não comprova observação. */
export function hasPropertyDetail(record: RemoteRecord): boolean {
  return ["codigoImovel", "codigo", "referenciaImovel", "finalidade", "codigoTipoImovel",
    "valorEsperado", "descricaoImovel", "endereco", "area"].some((key) => key in record);
}
