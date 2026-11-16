import type { ModelProperty, SearchDocument, SearchFilters } from "./contracts";
import { featureEvidence } from "./features";
import { normalizeText } from "./state";
export function matchesCount(value: number | null, filter: SearchFilters["bedrooms"]) {
  if (!filter) return true;
  if (value == null) return false;
  return {
    eq: value === filter.value,
    gte: value >= filter.value,
    gt: value > filter.value,
    lte: value <= filter.value,
    lt: value < filter.value,
  }[filter.op];
}
export function matchesRange(value: number | null, range: SearchFilters["budget"]) {
  if (!range) return true;
  if (value == null) return false;
  return (
    (!range.min || (range.min.inclusive ? value >= range.min.value : value > range.min.value)) &&
    (!range.max || (range.max.inclusive ? value <= range.max.value : value < range.max.value))
  );
}
export function hardMatch(p: ModelProperty, f: SearchFilters) {
  for (const key of ["operation", "type", "city", "district", "reference", "stage"] as const)
    if (f[key] && normalizeText(p[key] ?? "") !== normalizeText(f[key]!)) return false;
  for (const key of ["bedrooms", "bathrooms", "suites", "parking"] as const)
    if (!matchesCount(p[key], f[key])) return false;
  for (const key of ["furnished", "financing", "exchange"] as const)
    if (f[key] != null && p[key] !== f[key]) return false;
  if (f.budget && (p.priceMode !== "fixo" || !matchesRange(p.price, f.budget))) return false;
  if (f.area && !matchesRange(p.areas[f.area.kind], f.area.range)) return false;
  return f.features
    .filter((e) => e.required)
    .every((e) => featureEvidence(p, e.name, e.scope).state === e.state);
}
export function rankDocuments(
  documents: SearchDocument[],
  brand: SearchDocument["brand"],
  f: SearchFilters,
) {
  const ranked = documents
    .filter((d) => d.brand === brand && hardMatch(d.property, f))
    .map((document) => {
      const differences = f.features
        .filter(
          (e) =>
            !e.required && featureEvidence(document.property, e.name, e.scope).state !== e.state,
        )
        .map((e) => {
          const actual = featureEvidence(document.property, e.name, e.scope).state;
          const label = `${e.name}${e.scope === "condominium" ? " do condomínio" : " privativa"}`;
          return actual === "unknown"
            ? `${label}: não informada`
            : `${label}: ${actual === "present" ? "presente" : "ausente"}`;
        });
      return { document, differences };
    })
    .sort(
      (a, b) =>
        a.differences.length - b.differences.length ||
        a.document.property.id.localeCompare(b.document.property.id),
    );
  const exact = ranked.filter((r) => !r.differences.length);
  return (exact.length ? exact : ranked.filter((r) => r.differences.length === 1)).slice(0, 5);
}
