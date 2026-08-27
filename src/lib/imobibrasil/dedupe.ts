/**
 * Deduplicação determinística remoto → catálogo local.
 *
 * Ordem obrigatória: vínculo exato → código/referência do mesmo provedor →
 * correspondência assistida → provável/ambígua (revisão humana) → novo imóvel.
 * Nenhuma regra fuzzy pode sobrescrever dados locais: no máximo ela sugere.
 */

import { normalizeKey, type NormalizedProperty } from "./import-normalizers.ts";
import type { ImobiProvider } from "./providers";


export type LocalCandidate = {
  id: string;
  carteira: string | null;
  source: string | null;
  source_property_id: string | null;
  codigo: string | null;
  referencia: string | null;
  operacao: string | null;
  tipo: string | null;
  cidade: string | null;
  bairro: string | null;
  logradouro: string | null;
  numero: string | null;
  valor: number | string | null;
  area_principal: number | string | null;
};

export type MatchStatus = "exact_match" | "probable_match" | "ambiguous" | "new";

export type MatchResult = {
  propertyId: string | null;
  status: MatchStatus;
  confidence: number;
  reason: string;
  alternatives: string[];
};

function num(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function close(a: number | null, b: number | null, tolerance: number): boolean {
  if (a === null || b === null) return false;
  if (a === 0 && b === 0) return true;
  return Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * tolerance;
}

function addressKey(candidate: {
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
}): string {
  return [normalizeKey(candidate.logradouro), normalizeKey(candidate.numero), normalizeKey(candidate.bairro)]
    .filter(Boolean)
    .join(" ");
}

export function matchProperty(
  provider: ImobiProvider,
  remote: NormalizedProperty,
  candidates: LocalCandidate[],
  linkedPropertyIds: Set<string> = new Set(),
): MatchResult {
  // Só compara dentro da mesma carteira — Cordial e Morar nunca se mesclam.
  const pool = candidates.filter((candidate) => (candidate.carteira ?? provider) === provider);

  const exact = pool.find(
    (candidate) =>
      !!candidate.source_property_id && String(candidate.source_property_id).trim() === remote.externalId,
  );
  if (exact) {
    return {
      propertyId: exact.id,
      status: "exact_match",
      confidence: 1,
      reason: "Código externo do provedor já presente no cadastro.",
      alternatives: [],
    };
  }

  const remoteRef = normalizeKey(remote.externalReference);
  const remoteCode = normalizeKey(remote.codigo);
  const strong = pool.filter((candidate) => {
    if (linkedPropertyIds.has(candidate.id)) return false;
    const ref = normalizeKey(candidate.referencia);
    const code = normalizeKey(candidate.codigo);
    return (
      (!!remoteRef && (ref === remoteRef || code === remoteRef)) ||
      (!!remoteCode && (code === remoteCode || ref === remoteCode))
    );
  });
  if (strong.length === 1) {
    return {
      propertyId: strong[0]!.id,
      status: "exact_match",
      confidence: 0.95,
      reason: "Referência/código do provedor idêntico ao cadastro local.",
      alternatives: [],
    };
  }
  if (strong.length > 1) {
    return {
      propertyId: null,
      status: "ambiguous",
      confidence: 0.5,
      reason: `${strong.length} cadastros locais compartilham a mesma referência.`,
      alternatives: strong.map((c) => c.id),
    };
  }

  const remoteAddress = addressKey(remote);
  const remoteCity = normalizeKey(remote.cidade);
  const remoteType = normalizeKey(remote.tipo);

  const assisted = pool.filter((candidate) => {
    if (linkedPropertyIds.has(candidate.id)) return false;
    if (!remoteAddress || !remoteCity) return false;
    return (
      addressKey(candidate) === remoteAddress &&
      normalizeKey(candidate.cidade) === remoteCity &&
      normalizeKey(candidate.tipo) === remoteType &&
      (candidate.operacao ?? remote.operacao) === remote.operacao
    );
  });
  if (assisted.length === 1) {
    return {
      propertyId: assisted[0]!.id,
      status: "probable_match",
      confidence: 0.8,
      reason: "Endereço, cidade, tipo e operação coincidem.",
      alternatives: [],
    };
  }
  if (assisted.length > 1) {
    return {
      propertyId: null,
      status: "ambiguous",
      confidence: 0.5,
      reason: `${assisted.length} cadastros locais com o mesmo endereço e tipo.`,
      alternatives: assisted.map((c) => c.id),
    };
  }

  const probable = pool.filter((candidate) => {
    if (linkedPropertyIds.has(candidate.id)) return false;
    if (!remoteCity || normalizeKey(candidate.cidade) !== remoteCity) return false;
    if (normalizeKey(candidate.bairro) !== normalizeKey(remote.bairro)) return false;
    if (remoteType && normalizeKey(candidate.tipo) !== remoteType) return false;
    return (
      close(num(candidate.valor), remote.valor, 0.02) &&
      close(num(candidate.area_principal), remote.areaPrincipal, 0.02)
    );
  });
  if (probable.length === 1) {
    return {
      propertyId: probable[0]!.id,
      status: "probable_match",
      confidence: 0.6,
      reason: "Bairro, tipo, área e valor equivalentes — requer confirmação.",
      alternatives: [],
    };
  }
  if (probable.length > 1) {
    return {
      propertyId: null,
      status: "ambiguous",
      confidence: 0.4,
      reason: `${probable.length} cadastros locais com área e valor equivalentes.`,
      alternatives: probable.map((c) => c.id),
    };
  }

  return {
    propertyId: null,
    status: "new",
    confidence: 0,
    reason: "Nenhuma correspondência segura no catálogo local.",
    alternatives: [],
  };
}
