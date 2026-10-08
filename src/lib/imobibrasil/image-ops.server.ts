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
  reason: "formato_desconhecido" | "identidade_incompleta" | "paginacao_incompleta" | "falha_consulta" | "limite_de_chamadas" | null;
  items: RemoteImage[];
};

/**
 * Lê a galeria COMPLETA do site, percorrendo a paginação. Formato desconhecido,
 * falha de consulta ou paginação incompleta NUNCA equivalem a "galeria vazia".
 */
/** Total de fotos segundo a ficha do imóvel (/imovel/dados), fonte independente da lista. */
export async function fetchDetailImageTotal(
  provider: ImobiProvider,
  externalId: string,
  correlationId?: string,
): Promise<number | null> {
  const response = await imobiRequest(provider, `/imovel/dados/${encodeURIComponent(externalId)}`, {
    method: "GET",
    ...(correlationId ? { correlationId } : {}),
  });
  return detailImageTotal(response.data);
}

export function detailImageTotal(payload: unknown): number | null {
  const root = payload as { resultSet?: { imagens?: unknown } } | null;
  const list = root?.resultSet?.imagens;
  return Array.isArray(list) ? list.length : null;
}

export const SLOT_REFUSED_REASON = "limite_de_chamadas" as const;

/** Recusa de vaga (limite 18/min) ou conta bloqueada: nada foi lido do site. */
export function isSlotRefusal(error: unknown): boolean {
  const category = (error as { category?: unknown } | null)?.category;
  return category === "rate_limit" || category === "config";
}

/**
 * Leitura inicial da rodada de fotos: sem vaga, a rodada é adiada (erro de
 * limite que não consome tentativa) em vez de virar "leitura não confiável".
 */
export async function fetchRemoteGalleryOrDefer(
  provider: ImobiProvider,
  externalId: string,
  correlationId?: string,
): Promise<RemoteGallery> {
  const gallery = await fetchRemoteGallery(provider, externalId, correlationId);
  if (!gallery.reliable && gallery.reason === SLOT_REFUSED_REASON) {
    const { ImobiApiError } = await import("./errors");
    throw new ImobiApiError({
      message: "Limite de chamadas do site ocupado; conferência das fotos adiada.",
      category: "rate_limit", retryAfterSeconds: 60,
    });
  }
  return gallery;
}

export async function fetchRemoteGallery(
  provider: ImobiProvider,
  externalId: string,
  correlationId?: string,
  requestPage?: (page: number) => Promise<unknown>,
  independentTotal?: () => Promise<number | null>,
): Promise<RemoteGallery> {
  const items: RemoteImage[] = [];
  const codes = new Set<string>();
  let page = 1;
  let expectedPages: number | null = null;
  let expectedItems: number | null = null;

  while (page <= MAX_PAGES) {
    let payload: unknown;
    try {
      if (requestPage) payload = await requestPage(page);
      else {
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
      }
    } catch (error) {
      // Vaga recusada pelo nosso próprio limitador não é leitura ruim do site.
      if (isSlotRefusal(error)) return { reliable: false, reason: SLOT_REFUSED_REASON, items };
      return { reliable: false, reason: "falha_consulta", items };
    }

    const parsed = parseRemoteImagePage(payload, page, PER_PAGE);
    if (!parsed.recognized) return { reliable: false, reason: "formato_desconhecido", items };
    if (parsed.page !== page || (parsed.totalPages > 0 && page > parsed.totalPages))
      return { reliable: false, reason: "paginacao_incompleta", items };
    if (parsed.totalPages > 0) {
      if (expectedPages !== null && expectedPages !== parsed.totalPages)
        return { reliable: false, reason: "paginacao_incompleta", items };
      expectedPages = parsed.totalPages;
    }
    if (parsed.totalItems > 0) {
      if (expectedItems !== null && expectedItems !== parsed.totalItems)
        return { reliable: false, reason: "paginacao_incompleta", items };
      expectedItems = parsed.totalItems;
    }
    // A API real (23/09/2026) ignora `page`/`per_page` e repete a lista inteira.
    // Repetição exata NÃO prova sozinha que a lista não foi cortada: só vale
    // como completa se a ficha do imóvel (fonte independente) tiver o mesmo total.
    if (
      page === 2 && expectedPages === null && expectedItems === null &&
      parsed.items.length === items.length && items.length > 0 &&
      parsed.items.every((item, index) =>
        item.codigoImagem !== null &&
        item.codigoImagem === items[index]?.codigoImagem &&
        item.destaque === items[index]?.destaque)
    ) {
      let total: number | null = null;
      try {
        total = await (independentTotal ?? (() => fetchDetailImageTotal(provider, externalId, correlationId)))();
      } catch {
        total = null;
      }
      if (total !== null && total === items.length) return { reliable: true, reason: null, items };
      return { reliable: false, reason: "paginacao_incompleta", items };
    }
    for (const item of parsed.items) {
      if (!item.codigoImagem || codes.has(item.codigoImagem))
        return { reliable: false, reason: "identidade_incompleta", items };
      codes.add(item.codigoImagem);
    }
    items.push(...parsed.items);
    if (expectedItems !== null && items.length > expectedItems)
      return { reliable: false, reason: "paginacao_incompleta", items };
    if (parsed.items.length === 0 ||
        (expectedPages !== null && page >= expectedPages) ||
        (expectedItems !== null && items.length >= expectedItems)) {
      if ((expectedItems !== null && items.length !== expectedItems) ||
          (expectedPages !== null && page < expectedPages))
        return { reliable: false, reason: "paginacao_incompleta", items };
      return { reliable: true, reason: null, items };
    }
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

  // Resposta positiva da operação sem releitura completa ainda pode ocultar
  // uma imagem remanescente. Mantemos o tombstone e a intenção para a próxima
  // conferência, sem repetir a exclusão antes de ler novamente.
  return { confirmed: false, alreadyAbsent: false,
    message: message ?? (confirmed ? "Exclusão aceita; conferência da galeria pendente." : "Exclusão não confirmada.") };
}
