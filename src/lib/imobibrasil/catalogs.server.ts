/**
 * Catálogos por provedor (cidades, tipos de imóvel e características).
 * Read-only na API externa; escreve apenas no cache local `provider_catalog_items`.
 *
 * Os códigos da Cordial NUNCA são reutilizados na Morar, mesmo quando coincidem hoje.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ImobiApiError } from "./errors";
import { imobiRequest, hasProviderToken } from "./client.server";
import { normalizeLabel, type ResolvedProviderCodes, type LocalPropertyForSync } from "./serializers";
import type { ImobiProvider } from "./providers";

export type CatalogKind = "city" | "property_type" | "characteristic";

const CATALOG_ENDPOINTS: Record<CatalogKind, string> = {
  city: "/cidade/lista",
  property_type: "/imovel/tipo/lista",
  characteristic: "/imovel/caracteristica/lista",
};

const CODE_KEYS = [
  "codigoCidade",
  "codigoTipoImovel",
  "codigoCaracteristica",
  "codigo",
  "id",
  "codigoTipo",
];
const LABEL_KEYS = [
  "descricao",
  "descricaoTipoImovel",
  "descricaoCaracteristica",
  "nomeCaracteristica",
  "nomeTipoImovel",
  "nome",
  "nomeCidade",
  "cidade",
  "titulo",
  "label",
];
const GROUP_KEYS = ["nomeGrupo", "grupo", "categoria", "estado", "uf", "sigla", "siglaEstado", "grupoCaracteristica"];

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

/** A API não documenta o envelope: procuramos o primeiro array de objetos plausível. */
export function extractCatalogArray(payload: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 4 || !payload) return [];
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  }
  if (typeof payload === "object") {
    for (const key of ["resultSet", "data", "result", "lista", "itens", "registros"]) {
      const value = (payload as Record<string, unknown>)[key];
      const found = extractCatalogArray(value, depth + 1);
      if (found.length) return found;
    }
    for (const value of Object.values(payload as Record<string, unknown>)) {
      const found = extractCatalogArray(value, depth + 1);
      if (found.length) return found;
    }
  }
  return [];
}

export type CatalogItem = {
  externalCode: string;
  label: string;
  normalizedLabel: string;
  groupName: string | null;
  payload: Record<string, unknown>;
};

export function mapCatalogItems(payload: unknown): CatalogItem[] {
  const items: CatalogItem[] = [];
  const seen = new Set<string>();
  for (const raw of extractCatalogArray(payload)) {
    const externalCode = pickString(raw, CODE_KEYS);
    const label = pickString(raw, LABEL_KEYS);
    if (!externalCode || !label || seen.has(externalCode)) continue;
    seen.add(externalCode);
    items.push({
      externalCode,
      label,
      normalizedLabel: normalizeLabel(label),
      groupName: pickString(raw, GROUP_KEYS),
      payload: raw,
    });
  }
  return items;
}

export async function fetchAccountStatus(provider: ImobiProvider) {
  if (!hasProviderToken(provider)) {
    return { provider, ok: false, configured: false, message: "Token não configurado." };
  }
  try {
    const response = await imobiRequest(provider, "/account/status", { method: "GET" });
    return { provider, ok: true, configured: true, httpStatus: response.httpStatus, message: "Conta acessível." };
  } catch (error) {
    const normalized = error instanceof ImobiApiError ? error : null;
    return {
      provider,
      ok: false,
      configured: true,
      httpStatus: normalized?.httpStatus ?? null,
      category: normalized?.category ?? "unknown",
      message: normalized?.message ?? "Falha ao consultar a conta.",
    };
  }
}

/** A listagem do provedor é paginada (20 por página); percorremos todas as páginas. */
async function fetchCatalogPages(
  provider: ImobiProvider,
  endpoint: string,
  maxPages: number,
): Promise<CatalogItem[]> {
  const collected: CatalogItem[] = [];
  const seen = new Set<string>();
  let page = 1;
  let totalPages = 1;

  while (page <= Math.min(totalPages, maxPages)) {
    const separator = endpoint.includes("?") ? "&" : "?";
    const response = await imobiRequest(provider, `${endpoint}${separator}page=${page}`, { method: "GET" });
    const envelope = (response.data as Record<string, unknown>)?.["resultSet"] as
      | Record<string, unknown>
      | undefined;
    const reported = Number(envelope?.["total_pages"] ?? 1);
    if (Number.isFinite(reported) && reported > 0) totalPages = reported;

    const items = mapCatalogItems(response.data);
    if (!items.length) break;
    for (const item of items) {
      if (seen.has(item.externalCode)) continue;
      seen.add(item.externalCode);
      collected.push(item);
    }
    page += 1;
  }

  return collected;
}

export async function refreshProviderCatalogs(
  admin: SupabaseClient,
  provider: ImobiProvider,
  kinds: CatalogKind[] = ["city", "property_type", "characteristic"],
) {
  const summary: Record<string, number> = {};
  for (const kind of kinds) {
    // Cidades: o cadastro nacional tem ~5.6 mil itens; a operação é no RS.
    const endpoint = kind === "city" ? `${CATALOG_ENDPOINTS[kind]}?estado=RS` : CATALOG_ENDPOINTS[kind];
    const items = await fetchCatalogPages(provider, endpoint, kind === "city" ? 40 : 30);
    summary[kind] = items.length;
    if (!items.length) continue;
    const rows = items.map((item) => ({
      provider,
      kind,
      external_code: item.externalCode,
      label: item.label,
      normalized_label: item.normalizedLabel,
      group_name: item.groupName,
      payload: item.payload as never,
      synced_at: new Date().toISOString(),
    }));
    for (let index = 0; index < rows.length; index += 500) {
      const { error } = await admin
        .from("provider_catalog_items")
        .upsert(rows.slice(index, index + 500), { onConflict: "provider,kind,external_code" });
      if (error) throw new Error(error.message);
    }
  }
  return summary;
}


export type CodeResolution = {
  codes: ResolvedProviderCodes;
  characteristicCodes: string[];
  unmapped: Array<{ domain: string; value: string }>;
};

/**
 * Resolve códigos pelo mapa administrativo confirmado e, na ausência dele,
 * por correspondência normalizada no catálogo do destino. Nada é adivinhado:
 * o que não resolver entra em `unmapped` e o campo opcional é omitido.
 */
export async function resolveProviderCodes(
  admin: SupabaseClient,
  provider: ImobiProvider,
  property: LocalPropertyForSync & { cidade?: string | null; uf?: string | null; caracteristicas?: string[] | null },
): Promise<CodeResolution> {
  const unmapped: CodeResolution["unmapped"] = [];

  const [{ data: maps }, { data: catalog }] = await Promise.all([
    admin.from("provider_value_maps").select("domain, local_key, external_code").eq("provider", provider),
    admin.from("provider_catalog_items").select("kind, external_code, normalized_label").eq("provider", provider),
  ]);

  const mapIndex = new Map<string, string>();
  for (const row of maps ?? []) {
    mapIndex.set(`${row.domain}:${normalizeLabel(row.local_key)}`, row.external_code);
  }
  const catalogIndex = new Map<string, string>();
  for (const row of catalog ?? []) {
    const key = `${row.kind}:${row.normalized_label}`;
    if (!catalogIndex.has(key)) catalogIndex.set(key, row.external_code);
  }

  const resolve = (domain: "property_type" | "city" | "characteristic" | "area_unit", value?: string | null) => {
    const text = (value ?? "").trim();
    if (!text) return null;
    const normalized = normalizeLabel(text);
    const mapped = mapIndex.get(`${domain}:${normalized}`);
    if (mapped) return mapped;
    if (domain !== "area_unit") {
      const fromCatalog = catalogIndex.get(`${domain}:${normalized}`);
      if (fromCatalog) return fromCatalog;
    }
    unmapped.push({ domain, value: text });
    return null;
  };

  const codigoTipoImovel = resolve("property_type", property.tipo);
  const codigoCidade = resolve("city", property.cidade);
  const areaUnit = (label?: string | null) => resolve("area_unit", label ?? "m2") ?? undefined;

  const characteristicCodes: string[] = [];
  for (const characteristic of property.caracteristicas ?? []) {
    const code = resolve("characteristic", characteristic);
    if (code) characteristicCodes.push(code);
  }

  return {
    codes: {
      codigoTipoImovel,
      descricaoTipoImovel: property.tipo ?? null,
      codigoCidade,
      tipoAreaPrivativa: areaUnit(null),
      tipoAreaTotal: areaUnit(null),
      tipoAreaTerreno: areaUnit(null),
      tipoAreaConstruida: areaUnit(null),
    },
    characteristicCodes,
    unmapped,
  };
}
