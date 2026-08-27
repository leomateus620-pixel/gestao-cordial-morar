/**
 * Leitura da API ImobiBrasil (somente GET). Server-only.
 *
 * Reutiliza o `imobiRequest` já existente (header `token` vindo de secret,
 * retry com backoff, sanitização de mensagens). Nada aqui altera dados no site.
 */

import { imobiRequest } from "./client.server";
import type { ImobiProvider } from "./providers";

export type RemoteRecord = Record<string, unknown>;

export type RemotePage = {
  items: RemoteRecord[];
  page: number;
  perPage: number;
  totalPages: number;
  totalItems: number;
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
    return {
      items: payload.filter((item): item is RemoteRecord => !!asRecord(item)),
      page: requestedPage,
      perPage: requestedPerPage,
      totalPages: payload.length ? requestedPage : requestedPage,
      totalItems: payload.length,
    };
  }

  const root = asRecord(payload) ?? {};
  const resultSet = asRecord(root["resultSet"]) ?? root;

  const rawItems =
    (Array.isArray(resultSet["data"]) && resultSet["data"]) ||
    (Array.isArray(resultSet["total_data"]) && resultSet["total_data"]) ||
    (Array.isArray(root["data"]) && root["data"]) ||
    (Array.isArray(root["imoveis"]) && root["imoveis"]) ||
    [];

  const items = (rawItems as unknown[]).filter((item): item is RemoteRecord => !!asRecord(item));

  return {
    items,
    page: toInt(resultSet["page"] ?? root["page"], requestedPage),
    perPage: toInt(resultSet["per_page"] ?? root["per_page"], requestedPerPage),
    totalPages: toInt(resultSet["total_pages"] ?? root["total_pages"], items.length ? requestedPage : 0),
    totalItems: toInt(resultSet["total_items"] ?? root["total_items"], items.length),
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
  if (Array.isArray(payload)) return payload.filter((i): i is RemoteRecord => !!asRecord(i));
  const root = asRecord(payload) ?? {};
  for (const key of ["resultSet", "data", "imagens", "total_data"]) {
    const value = root[key];
    if (Array.isArray(value)) return value.filter((i): i is RemoteRecord => !!asRecord(i));
    const nested = asRecord(value);
    if (nested && Array.isArray(nested["data"])) {
      return (nested["data"] as unknown[]).filter((i): i is RemoteRecord => !!asRecord(i));
    }
  }
  return [];
}

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
