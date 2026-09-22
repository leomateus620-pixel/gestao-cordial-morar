/**
 * Operações de IMAGEM na ImobiBrasil (server-only).
 *
 * Só recursos de imagem — nunca `/imovel/alterar`, nunca cadastro. Contrato
 * conferido em 22/09/2026 nos dois domínios (`/api/v1/doc/api.json`):
 *   GET  /imovel/{codigoImovel}/imagem/lista           (page, per_page, status)
 *   POST /imovel/{codigoImovel}/imagem/inserir         (multipart: imagem, destaque)
 *   POST /imovel/{codigoImovel}/imagem/excluir/{codigoImagem}
 *
 * A exclusão remove apenas a imagem daquele imóvel.
 */

import { imobiRequest } from "./client.server";
import {
  isDeleteConfirmed,
  parseRemoteImagePage,
  type RemoteImage,
} from "./image-parsers";
import type { ImobiProvider } from "./providers";

const PER_PAGE = 50;
const MAX_PAGES = 20;

export type RemoteGallery = {
  /** Formato reconhecido e paginação percorrida até o fim? */
  reliable: boolean;
  /** Motivo quando não é confiável: usado para o estado "não sei". */
  reason: "formato_desconhecido" | "paginacao_incompleta" | "falha_consulta" | null;
  items: RemoteImage[];
};

/**
 * Lê a galeria COMPLETA do site, percorrendo a paginação. Formato desconhecido,
 * falha de consulta ou paginação incompleta NUNCA equivalem a "galeria vazia".
 */
export async function fetchRemoteGallery(
  provider: ImobiProvider,
  externalId: string,
  correlationId?: string,
): Promise<RemoteGallery> {
  const items: RemoteImage[] = [];
  let page = 1;

  while (page <= MAX_PAGES) {
    let payload: unknown;
    try {
      const response = await imobiRequest(
        provider,
        `/imovel/${encodeURIComponent(externalId)}/imagem/lista?page=${page}&per_page=${PER_PAGE}`,
        {
          method: "GET",
          extraHeaders: { codigoImovel: externalId },
          ...(correlationId ? { correlationId } : {}),
        },
      );
      payload = response.data;
    } catch {
      return { reliable: false, reason: "falha_consulta", items };
    }

    const parsed = parseRemoteImagePage(payload, page, PER_PAGE);
    if (!parsed.recognized) return { reliable: false, reason: "formato_desconhecido", items };
    items.push(...parsed.items);

    const lastPage =
      parsed.items.length < parsed.perPage ||
      (parsed.totalPages > 0 && page >= parsed.totalPages) ||
      (parsed.totalItems > 0 && items.length >= parsed.totalItems);
    if (lastPage) return { reliable: true, reason: null, items };
    page += 1;
  }

  return { reliable: false, reason: "paginacao_incompleta", items };
}

export type DeleteRemoteImageResult = {
  confirmed: boolean;
  /** Já não estava lá (conferido por leitura) — conta como removida. */
  alreadyAbsent: boolean;
  message: string | null;
};

/**
 * Exclui UMA imagem por código exato e confere por leitura. Nunca apaga em
 * lote sem conferência, e nunca chama nada do catálogo global.
 */
export async function deleteRemoteImage(
  provider: ImobiProvider,
  externalId: string,
  codigoImagem: string,
  correlationId?: string,
): Promise<DeleteRemoteImageResult> {
  let message: string | null = null;
  let confirmed = false;
  try {
    const response = await imobiRequest(
      provider,
      `/imovel/${encodeURIComponent(externalId)}/imagem/excluir/${encodeURIComponent(codigoImagem)}`,
      {
        method: "POST",
        extraHeaders: { codigoImovel: externalId, codigoImagem },
        ...(correlationId ? { correlationId } : {}),
        // Exclusão por ID é idempotente na prática, mas não repetimos às cegas:
        // a conferência por leitura decide.
        retryOnNetwork: false,
      },
    );
    confirmed = isDeleteConfirmed(response.data);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  // Conferência por leitura: a foto saiu mesmo da galeria?
  const gallery = await fetchRemoteGallery(provider, externalId, correlationId);
  if (gallery.reliable) {
    const stillThere = gallery.items.some((item) => item.codigoImagem === codigoImagem);
    if (!stillThere) return { confirmed: true, alreadyAbsent: !confirmed, message };
    return { confirmed: false, alreadyAbsent: false, message: message ?? "A foto continua no site." };
  }

  return { confirmed, alreadyAbsent: false, message };
}
