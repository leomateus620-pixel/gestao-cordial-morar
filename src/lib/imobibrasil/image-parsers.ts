/**
 * Parsers das respostas de IMAGEM da ImobiBrasil (puros, sem I/O).
 *
 * Contrato conferido em 22/09/2026 em `/api/v1/doc/api.json` nos dois domínios:
 *  - `GET  /imovel/{codigoImovel}/imagem/lista` → `codigoImagem`, `url`, `destaque`
 *    (aceita `page`, `per_page`, `status`);
 *  - `POST /imovel/{codigoImovel}/imagem/inserir` → resposta NÃO documentada;
 *  - `POST /imovel/{codigoImovel}/imagem/excluir/{codigoImagem}` → `status: true`.
 *
 * Por isso este módulo existe: o leitor genérico de imóvel (`extractExternalId`)
 * aceita `codigoImovel`/`codigo`/`id` e devolveria o código do IMÓVEL como se
 * fosse o código da FOTO. Aqui só chave de imagem é aceita; sem ela, o código
 * fica `null` (desconhecido) e a reconciliação resolve por leitura.
 */

export type RemoteImage = {
  /** Código da imagem no site. `null` = a resposta não identificou a foto. */
  codigoImagem: string | null;
  url: string | null;
  destaque: boolean;
};

export type RemoteImagePage = {
  /** O formato da resposta foi reconhecido? `false` nunca significa galeria vazia. */
  recognized: boolean;
  items: RemoteImage[];
  page: number;
  perPage: number;
  totalPages: number;
  totalItems: number;
};

/** Chaves aceitas como código de imagem. `codigo`/`id` NÃO entram: são ambíguas. */
const IMAGE_ID_KEYS = ["codigoImagem", "codigo_imagem", "idImagem", "imagemCodigo"] as const;

const COVER_KEYS = ["destaque", "imagemDestaque", "destaqueImagem", "principal"] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export function readImageId(record: Record<string, unknown>): string | null {
  for (const key of IMAGE_ID_KEYS) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return String(value);
    if (typeof value === "string" && /^\d+$/.test(value.trim())) return value.trim();
  }
  return null;
}

export function readImageCover(record: Record<string, unknown>): boolean {
  for (const key of COVER_KEYS) {
    const value = record[key];
    if (value === true || value === 1) return true;
    if (typeof value === "string" && /^(sim|s|1|true)$/i.test(value.trim())) return true;
  }
  return false;
}

function toRemoteImage(record: Record<string, unknown>): RemoteImage {
  const url = record["url"] ?? record["imagem"] ?? record["urlImagem"];
  return {
    codigoImagem: readImageId(record),
    url: typeof url === "string" && url.trim() ? url.trim() : null,
    destaque: readImageCover(record),
  };
}

/** Um item de galeria é reconhecível quando traz código OU endereço da imagem. */
function looksLikeImage(record: Record<string, unknown>): boolean {
  return readImageId(record) !== null || typeof record["url"] === "string";
}

/**
 * Lê uma página de `/imagem/lista`. Formato desconhecido devolve
 * `recognized: false` — quem chama trata como inconclusivo, nunca como vazio.
 */
export function parseRemoteImagePage(
  payload: unknown,
  requestedPage = 1,
  requestedPerPage = 50,
): RemoteImagePage {
  const empty: RemoteImagePage = {
    recognized: false,
    items: [],
    page: requestedPage,
    perPage: requestedPerPage,
    totalPages: 0,
    totalItems: 0,
  };

  // Uma linha desconhecida não pode simplesmente desaparecer da leitura:
  // isso faria uma exclusão parecer confirmada mesmo com a foto ainda no site.
  const collect = (items: unknown[]): RemoteImage[] | null => {
    const records = items.map(asRecord);
    if (records.some((record) => !record || !looksLikeImage(record))) return null;
    return (records as Record<string, unknown>[]).map(toRemoteImage);
  };

  if (Array.isArray(payload)) {
    const items = collect(payload);
    // Array vazio é resposta legítima: galeria sem fotos.
    return {
      recognized: items !== null,
      items: items ?? [],
      page: requestedPage,
      perPage: requestedPerPage,
      // Sem metadados não há prova de que a página cheia foi a última.
      totalPages: 0,
      totalItems: 0,
    };
  }

  const root = asRecord(payload);
  if (!root) return empty;
  if (root["status"] === false) return empty;

  const holder = asRecord(root["resultSet"]) ?? root;
  const rawArray =
    (Array.isArray(root["resultSet"]) && (root["resultSet"] as unknown[])) ||
    (Array.isArray(holder["data"]) && (holder["data"] as unknown[])) ||
    (Array.isArray(holder["total_data"]) && (holder["total_data"] as unknown[])) ||
    (Array.isArray(holder["imagens"]) && (holder["imagens"] as unknown[])) ||
    (Array.isArray(root["data"]) && (root["data"] as unknown[])) ||
    null;

  if (rawArray) {
    const items = collect(rawArray);
    const recognized = items !== null;
    return {
      recognized,
      items: items ?? [],
      page: toPositiveInt(holder["page"] ?? root["page"], requestedPage),
      perPage: toPositiveInt(holder["per_page"] ?? root["per_page"], requestedPerPage),
      totalPages: toPositiveInt(
        holder["total_pages"] ?? root["total_pages"],
        0,
      ),
      totalItems: toPositiveInt(holder["total_items"] ?? root["total_items"], 0),
    };
  }

  // `resultSet` como objeto único (é o que o contrato descreve).
  if (looksLikeImage(holder)) {
    return {
      recognized: true,
      items: [toRemoteImage(holder)],
      page: requestedPage,
      perPage: requestedPerPage,
      totalPages: requestedPage,
      totalItems: 1,
    };
  }

  return empty;
}

/**
 * Código da foto recém-inserida. A resposta do `inserir` não é documentada:
 * só aceitamos chave de imagem explícita. Qualquer outra coisa é `null`
 * (desconhecido) e a reconciliação por leitura resolve.
 */
export function extractInsertedImageId(payload: unknown): string | null {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = extractInsertedImageId(item);
      if (found) return found;
    }
    return null;
  }
  const record = asRecord(payload);
  if (!record) return null;
  const direct = readImageId(record);
  if (direct) return direct;
  for (const key of ["resultSet", "data", "result", "imagem", "retorno"]) {
    if (key in record) {
      const found = extractInsertedImageId(record[key]);
      if (found) return found;
    }
  }
  return null;
}

/** A exclusão confirmou? `status: true` / `resultSet: true` / corpo `true`. */
export function isDeleteConfirmed(payload: unknown): boolean {
  if (payload === true) return true;
  const record = asRecord(payload);
  if (!record) return false;
  if (record["status"] === false) return false;
  if (record["resultSet"] === true) return true;
  return record["status"] === true;
}
