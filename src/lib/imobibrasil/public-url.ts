/**
 * Extração e validação da URL pública canônica devolvida pela API ImobiBrasil.
 * Nunca montamos a URL a partir do código: só aceitamos o que o site devolveu,
 * e apenas se o host pertencer ao provedor correspondente.
 */

import type { ImobiProvider } from "./providers";

export const PROVIDER_PUBLIC_HOSTS: Record<ImobiProvider, string[]> = {
  cordial: ["cordialimoveis.com", "www.cordialimoveis.com"],
  morar: ["imobiliariamorarimoveis.com.br", "www.imobiliariamorarimoveis.com.br"],
};

const PROVIDER_PUBLIC_ORIGIN: Record<ImobiProvider, string> = {
  cordial: "https://cordialimoveis.com",
  morar: "https://imobiliariamorarimoveis.com.br",
};

const URL_KEYS = [
  "urlImovel",
  "url_imovel",
  "url",
  "linkImovel",
  "link",
  "urlAmigavel",
  "urlPublica",
  "permalink",
];

function pickCandidate(record: Record<string, unknown>): string | null {
  for (const key of URL_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

/**
 * Retorna a rota pública estável do anúncio quando existe um identificador
 * externo confirmado pelo provedor.
 */
export function buildStablePublicUrl(
  provider: ImobiProvider,
  externalId?: string | null,
): string | null {
  const id = externalId?.trim();
  if (!id || !/^\d+$/.test(id)) return null;
  return `${PROVIDER_PUBLIC_ORIGIN[provider]}/imovel/${encodeURIComponent(id)}`;
}

/**
 * Prioriza a URL canônica devolvida pela API. Quando ela não é informada,
 * usa a rota pública estável do provedor baseada no identificador externo.
 */
export function extractPublicUrl(
  provider: ImobiProvider,
  payload: unknown,
  externalId?: string | null,
): string | null {
  const fallback = buildStablePublicUrl(provider, externalId);
  if (!payload || typeof payload !== "object") return fallback;
  const root = payload as Record<string, unknown>;
  const nested = (root["resultSet"] ?? root["data"]) as Record<string, unknown> | undefined;
  const candidate =
    pickCandidate(root) ?? (nested && typeof nested === "object" ? pickCandidate(nested) : null);
  if (!candidate) return fallback;

  let url: URL;
  try {
    url = new URL(candidate.startsWith("http") ? candidate : `https://${candidate}`);
  } catch {
    return fallback;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
  if (!PROVIDER_PUBLIC_HOSTS[provider].includes(url.hostname.toLowerCase())) return fallback;

  url.protocol = "https:";
  const normalized = url.toString();
  if (externalId && !normalized.includes(String(externalId))) {
    // Aceitamos mesmo sem o id no caminho (slug amigável), desde que o host confira.
    return normalized;
  }
  return normalized;
}
