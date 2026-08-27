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

export async function fetchPropertyPage(
  provider: ImobiProvider,
  page: number,
  perPage: number,
  correlationId?: string,
): Promise<RemotePage> {
  const response = await imobiRequest(
    provider,
    `/imovel/lista?page=${page}&per_page=${perPage}&status=ativo`,
    { method: "GET", ...(correlationId ? { correlationId } : {}) },
  );
  return extractPage(response.data, page, perPage);
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
