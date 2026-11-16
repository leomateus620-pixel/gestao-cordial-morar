import {
  draftSchema,
  emptyFilters,
  type BotAction,
  type FilterPatch,
  type SearchDraft,
} from "./contracts";
export class StaleDraft extends Error {
  constructor() {
    super("stale_revision");
  }
}
export function reduceDraft(
  current: SearchDraft,
  revision: number,
  action: Exclude<BotAction, { kind: "text" | "property_question" }>,
): SearchDraft {
  draftSchema.parse(current);
  if (revision !== current.revision) throw new StaleDraft();
  if (action.kind === "reset")
    return {
      revision: revision + 1,
      filters: emptyFilters(),
      countsAnswered: false,
      budgetAnswered: false,
    };
  if (action.kind === "search") return { ...current, revision: revision + 1 };
  const patch: FilterPatch = action.patch;
  const changedOperation = patch.operation != null && current.filters.operation !== patch.operation;
  const filters = { ...current.filters, ...patch };
  if (changedOperation && !Object.hasOwn(patch, "budget")) filters.budget = null;
  if (
    patch.city !== undefined &&
    patch.city !== current.filters.city &&
    patch.district === undefined
  )
    filters.district = null;
  return draftSchema.parse({
    revision: revision + 1,
    filters,
    countsAnswered:
      action.countsAnswered ??
      (current.countsAnswered || patch.bedrooms != null || patch.bathrooms != null),
    budgetAnswered:
      action.budgetAnswered ??
      (Object.hasOwn(patch, "budget") ? true : changedOperation ? false : current.budgetAnswered),
  });
}
export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
/** A strict Brazilian amount parser: bare ambiguous decimal punctuation is rejected. */
export function parseAmount(raw: string): number | null {
  const value = normalizeText(raw).replace(/^r\$\s*/, "");
  const m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(mil|k|milhao|milhoes)?$/.exec(value);
  if (!m) return null;
  const amount =
    Number(m[1].replace(/\./g, "") + (m[2] ? "." + m[2] : "")) *
    (m[3] === "mil" || m[3] === "k" ? 1000 : m[3] ? 1e6 : 1);
  return Number.isFinite(amount) && amount <= 1e12 ? amount : null;
}
export function parseBudget(text: string) {
  const normalized = normalizeText(text);
  const range: NonNullable<FilterPatch["budget"]> = { min: null, max: null };
  for (const m of normalized.matchAll(
    /\b(ate|no maximo|acima de|mais de|a partir de|pelo menos)\s*(?:r\$\s*)?([\d.,]+\s*(?:milhoes|milhao|mil|k)?)(?!\w)/g,
  )) {
    // Negated/quoted price comparisons need interpretation; do not force the opposite budget.
    const prefix = normalized.slice(Math.max(0, m.index! - 80), m.index);
    if (/\b(?:nao|nunca|nem)(?:\s+\w+){0,5}\s*$/.test(prefix)) continue;
    const suffix = normalized.slice(m.index! + m[0].length).trimStart();
    if (
      /^(?:quartos?|dormitorios?|banheiros?|suites?|vagas?|andares?|metros?|m[²2]|anos?|meses|dias?)(?=[\s.,;!?]|$)/.test(
        suffix,
      )
    )
      continue;
    const value = parseAmount(m[2].trim().replace(/[.,]+$/, ""));
    if (value == null) continue;
    // A bare small count is ambiguous without a monetary unit or budget context.
    if (value < 100 && !/r\$|mil|k/.test(m[0]) && !/orcamento|preco|reais|valor/.test(normalized))
      continue;
    if (/ate|no maximo/.test(m[1])) range.max = { value, inclusive: true };
    else range.min = { value, inclusive: !/acima|mais/.test(m[1]) };
  }
  return range.min || range.max ? range : null;
}
export function localGreeting(text: string) {
  return /^(oi|ola|bom dia|boa tarde|boa noite|tudo bem)[!.?\s]*$/.test(normalizeText(text));
}
