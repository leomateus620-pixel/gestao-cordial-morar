import { defaultSearch, type SiteFacets } from "./contract";
import { foldSearchText, type searchDraft } from "./search-state";

export type SearchValues = ReturnType<typeof searchDraft>;

/** Only these fields can be copied into or applied from the advanced dialog. */
export const morarAdvancedFields = [
  "suites",
  "valorModo",
  "areaTipo",
  "areaMin",
  "areaMax",
  "mobiliado",
  "financiamento",
  "permuta",
  "fotos",
  "estagio",
  // `referencia` lives in the main form (always visible), so the dialog never overwrites it.
  "exata",
  "q",
  "destaque",
] as const;
export type AdvancedField = (typeof morarAdvancedFields)[number];

export function advancedDraft(values: SearchValues): SearchValues {
  return Object.fromEntries(morarAdvancedFields.map((key) => [key, values[key] ?? ""]));
}

export function mergeAdvanced(current: SearchValues, draft: SearchValues): SearchValues {
  return { ...current, ...advancedDraft(draft) };
}

export function advancedCount(values: SearchValues): number {
  return morarAdvancedFields.filter((key) => {
    if (key === "exata" && !values.referencia) return false;
    if (key === "areaTipo" && !values.areaMin && !values.areaMax) return false;
    return values[key] && values[key] !== String(defaultSearch[key] ?? "");
  }).length;
}

/** Purchase and monthly rental budgets use different scales; changing intent clears only money. */
export function changePurpose(values: SearchValues, purpose: string): SearchValues {
  return values.finalidade === purpose
    ? values
    : { ...values, finalidade: purpose, precoMin: "", precoMax: "" };
}

export type LocationOption = { key: string; city: string; district: string; label: string };
export function morarLocations(facets: Pick<SiteFacets, "cities" | "districts">): LocationOption[] {
  const cities = new Set([
    ...facets.cities.map((city) => city.value),
    ...facets.districts.map((d) => d.city),
  ]);
  const options: LocationOption[] = [...cities].map((city) => ({
    key: JSON.stringify(["city", city]),
    city,
    district: "",
    label: `${city} · Todos os bairros`,
  }));
  for (const { city, value: district } of facets.districts) {
    options.push({
      key: JSON.stringify(["district", city, district]),
      city,
      district,
      label: `${district} · ${city}`,
    });
  }
  return [...new Map(options.map((option) => [option.key, option])).values()].sort((a, b) =>
    a.label.localeCompare(b.label, "pt-BR"),
  );
}

export function filterLocations(options: LocationOption[], text: string) {
  const terms = foldSearchText(text).split(/\s+/).filter(Boolean);
  return options.filter((option) =>
    terms.every((term) => foldSearchText(option.label).includes(term)),
  );
}

export function locationLabel(city: string, district: string) {
  return city
    ? `${district || city} · ${district ? city : "Todos os bairros"}`
    : district
      ? `${district} · Todas as cidades`
      : "";
}

const priceFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
export function formatSearchPrice(value: string) {
  return value === "" ? "" : priceFormat.format(Number(value));
}

/** The editable BRL representation never enters the numeric public search contract. */
export function parseSearchPrice(value: string): string {
  const clean = value.replace(/R\$|\s/g, "");
  if (!clean) return "";
  let normalized: string;
  if (clean.includes(",")) {
    if (!/^(\d+|\d{1,3}(\.\d{3})+),\d{0,2}$/.test(clean)) return "invalid";
    normalized = clean.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(clean)) normalized = clean.replace(/\./g, "");
  else if (/^\d+(\.\d{0,2})?$/.test(clean)) normalized = clean;
  else return "invalid";
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? String(numeric) : "invalid";
}
