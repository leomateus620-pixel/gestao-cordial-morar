/**
 * Leitura da API ImobiBrasil (somente GET). Server-only.
 *
 * Reutiliza o `imobiRequest` já existente (header `token` vindo de secret,
 * retry com backoff, sanitização de mensagens). Nada aqui altera dados no site.
 */

import { imobiRequest } from "./client.server";
import { extractList, extractPage, extractRecord, type RemotePage, type RemoteRecord } from "./read-parsers";
import type { ImobiProvider } from "./providers";
import { fetchAllPropertyPagesWith, type FullListResult } from "./list-all";

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

export type { FullListResult } from "./list-all";

/**
 * Lê a lista COMPLETA. Ausência de um imóvel só pode ser considerada real
 * quando `reliable` é verdadeiro — leitura parcial nunca justifica remoção local.
 * Com `status: "todos"` lê ativos e depois inativos, e só é confiável se as
 * duas leituras forem completas.
 */
export async function fetchAllPropertyPages(
  provider: ImobiProvider,
  options: { perPage?: number; status?: RemoteListStatus | "ativos_e_inativos"; correlationId?: string } = {},
): Promise<FullListResult> {
  const perPage = options.perPage ?? 50;
  const readOne = (status: RemoteListStatus) =>
    fetchAllPropertyPagesWith(
      (page) => fetchPropertyPage(provider, page, perPage, options.correlationId, status),
      perPage,
    );
  if (options.status !== "ativos_e_inativos") return readOne(options.status ?? "ativo");
  const ativos = await readOne("ativo");
  if (!ativos.reliable) return ativos;
  const inativos = await readOne("inativo");
  return {
    reliable: inativos.reliable,
    reason: inativos.reason,
    items: [...ativos.items, ...inativos.items],
    pagesRead: ativos.pagesRead + inativos.pagesRead,
    totalPages: (ativos.totalPages ?? 0) + (inativos.totalPages ?? 0),
  };
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
