import { defaultSearch, searchSchema, type SiteSearch } from "./contract";

/** Catalog criteria are independent of the presentation stored in the URL. */
export function catalogSearch(input: Partial<SiteSearch>) {
  const { visualizacao: _presentation, ...criteria } = searchSchema.parse(input);
  return criteria;
}

export function searchQueryKey(input: Partial<SiteSearch>, count = false): string {
  return JSON.stringify(
    Object.entries(catalogSearch(input))
      .filter(
        ([key, value]) => value !== undefined && (!count || !["pagina", "ordem"].includes(key)),
      )
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function searchDraft(input: Partial<SiteSearch> = {}): Record<string, string> {
  return Object.fromEntries(
    Object.entries({ ...defaultSearch, ...input })
      .filter(([, value]) => value != null)
      .map(([key, value]) => [key, String(value)]),
  );
}

export function updateSearchDraft(values: Record<string, string>, key: string, value: string) {
  return { ...values, [key]: value, ...(key === "cidade" ? { bairro: "" } : {}) };
}

export function foldSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

/** A new request invalidates old responses even when an upstream read cannot abort. */
export function latestRequest() {
  let generation = 0;
  return {
    next: () => ++generation,
    current: (candidate: number) => candidate === generation,
    invalidate: () => {
      generation++;
    },
  };
}
