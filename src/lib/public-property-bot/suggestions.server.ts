import { z } from "zod";
import { suggestionSchema, emptyFilters, type BotBrand, type Suggestion } from "./contracts";
import type { PublicRepository } from "./repository.server";
import { rankDocuments } from "./ranking";

/** The database owns hourly rotation/trend aggregates. Revalidate before serving any button. */
export async function publicSuggestions(
  repo: PublicRepository,
  brand: BotBrand,
  signal?: AbortSignal,
): Promise<Suggestion[]> {
  const set = z
    .object({ version: z.string().max(80), suggestions: z.array(suggestionSchema).max(12) })
    .strict()
    .parse(await repo.suggestions(brand, signal));
  const verified: Suggestion[] = [];
  for (const suggestion of set.suggestions) {
    const filters = { ...emptyFilters(), ...suggestion.patch };
    const candidates = await repo.candidates(brand, filters, signal);
    const matches = rankDocuments(candidates, brand, filters);
    if (matches.length) verified.push(suggestion);
    if (verified.length === 4) break;
  }
  return verified;
}
