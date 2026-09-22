/**
 * Leitura da API ImobiBrasil (somente GET). Server-only.
 *
 * Reutiliza o `imobiRequest` já existente (header `token` vindo de secret,
 * retry com backoff, sanitização de mensagens). Nada aqui altera dados no site.
 */

import { imobiRequest } from "./client.server";
import { extractList, extractPage, extractRecord, type RemotePage, type RemoteRecord } from "./read-parsers";
import type { ImobiProvider } from "./providers";

export type { RemotePage, RemoteRecord };
export { extractList, extractPage, extractRecord };

/** `ativo` | `inativo` | `todos` — ativos e inativos são lidos separadamente. */
export type RemoteListStatus = "ativo" | "inativo" | "todos";

export async function fetchPropertyPage(
  provider: ImobiProvider,
  page: number,
  perPage: number,
  correlationId?: string,
  status: RemoteListStatus = "ativo",
): Promise<RemotePage> {
  const filtro = status === "todos" ? "" : `&status=${status}`;
  const response = await imobiRequest(
    provider,
    `/imovel/lista?page=${page}&per_page=${perPage}${filtro}`,
    { method: "GET", ...(correlationId ? { correlationId } : {}) },
  );
  return extractPage(response.data, page, perPage);
}

export type FullListResult = {
  /** Só é confiável quando TODAS as páginas foram lidas sem falha. */
  reliable: boolean;
  reason: "ok" | "paginacao_incompleta" | "falha_consulta";
  items: RemoteRecord[];
  pagesRead: number;
  totalPages: number | null;
};

const MAX_LIST_PAGES = 200;

/**
 * Lê a lista COMPLETA. Ausência de um imóvel só pode ser considerada real
 * quando `reliable` é verdadeiro — leitura parcial nunca justifica remoção local.
 */
export async function fetchAllPropertyPages(
  provider: ImobiProvider,
  options: { perPage?: number; status?: RemoteListStatus; correlationId?: string } = {},
): Promise<FullListResult> {
  const perPage = options.perPage ?? 50;
  const items: RemoteRecord[] = [];
  let page = 1;
  let totalPages: number | null = null;

  while (page <= MAX_LIST_PAGES) {
    let result: RemotePage;
    try {
      result = await fetchPropertyPage(provider, page, perPage, options.correlationId, options.status ?? "ativo");
    } catch {
      return { reliable: false, reason: "falha_consulta", items, pagesRead: page - 1, totalPages };
    }
    items.push(...result.items);
    totalPages = result.totalPages ?? totalPages;
    const last = totalPages !== null ? page >= totalPages : result.items.length < perPage;
    if (last) return { reliable: true, reason: "ok", items, pagesRead: page, totalPages };
    page += 1;
  }

  return { reliable: false, reason: "paginacao_incompleta", items, pagesRead: page - 1, totalPages };
}

export async function fetchPropertyDetail(
  provider: ImobiProvider,
  externalId: string,
  correlationId?: string,
): Promise<RemoteRecord> {
  const response = await imobiRequest(provider, `/imovel/dados/${encodeURIComponent(externalId)}`, {
    method: "GET",
    // A documentação é inconsistente: enviamos no path e, por compatibilidade, no header.
    extraHeaders: { codigoImovel: externalId },
    ...(correlationId ? { correlationId } : {}),
  });
  return extractRecord(response.data);
}

/**
 * Cadastro de pessoa (proprietário/corretor) no Imobi.
 * Endpoint indicado pelo suporte em 11/09/2026: devolve nome, telefones e e-mail.
 */
export async function fetchPersonDetail(
  provider: ImobiProvider,
  personId: string,
  correlationId?: string,
): Promise<RemoteRecord> {
  const response = await imobiRequest(provider, `/pessoa/dados/${encodeURIComponent(personId)}`, {
    method: "GET",
    ...(correlationId ? { correlationId } : {}),
  });
  return extractRecord(response.data);
}

export async function fetchPropertyImages(
  provider: ImobiProvider,
  externalId: string,
  correlationId?: string,
): Promise<RemoteRecord[]> {
  const response = await imobiRequest(
    provider,
    `/imovel/${encodeURIComponent(externalId)}/imagem/lista`,
    {
      method: "GET",
      extraHeaders: { codigoImovel: externalId },
      ...(correlationId ? { correlationId } : {}),
    },
  );
  return extractList(response.data);
}
