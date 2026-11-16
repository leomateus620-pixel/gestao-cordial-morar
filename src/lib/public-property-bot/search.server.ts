import type { BotBrand, BotCard, BotQuestion, SearchDraft, SearchFilters } from "./contracts";
import { documentSchema, filtersSchema } from "./contracts";
import type { PublicRepository } from "./repository.server";
import { normalizeText } from "./state";
import { rankDocuments } from "./ranking";
import { featureEvidence } from "./features";
import { toCard } from "./cards";

export type PublicFacets = Awaited<ReturnType<PublicRepository["facets"]>>;
/** Values have to exist in the current catalog; the model never defines a location. */
export function validateLocations(
  filters: SearchFilters,
  facets: PublicFacets,
): {
  filters: SearchFilters;
  question: BotQuestion | null;
  rejected: Array<"type" | "city" | "district">;
} {
  const parsed = filtersSchema.parse(filters);
  const rejected: Array<"type" | "city" | "district"> = [];
  let question: BotQuestion | null = null;
  const valueIn = (value: string, choices: string[]) =>
    choices.find((c) => normalizeText(c) === normalizeText(value));
  // Validate every field before returning; an invalid type must not bypass city/district minimization.
  if (parsed.type) {
    const type = valueIn(parsed.type, facets.types);
    if (type) parsed.type = type;
    else {
      parsed.type = null;
      rejected.push("type");
      question = {
        kind: "clarify",
        message: "Não reconheci esse tipo no catálogo. Qual tipo de imóvel você procura?",
      };
    }
  }
  if (parsed.city) {
    const city = valueIn(parsed.city, facets.cities);
    if (city) parsed.city = city;
    else {
      parsed.city = null;
      rejected.push("city");
      if (parsed.district) {
        parsed.district = null;
        rejected.push("district");
      }
      question ??= {
        kind: "clarify",
        message: "Qual cidade você procura? Posso consultar as cidades disponíveis neste site.",
      };
    }
  }
  if (parsed.district) {
    const matches = facets.districts.filter(
      (d) =>
        normalizeText(d.district) === normalizeText(parsed.district!) &&
        (!parsed.city || normalizeText(d.city) === normalizeText(parsed.city)),
    );
    const cities = [...new Set(matches.map((m) => m.city))];
    if (!matches.length) {
      parsed.district = null;
      rejected.push("district");
      question ??= {
        kind: "clarify",
        message:
          "Não localizei esse bairro na cidade informada. Quer revisar o bairro ou buscar sem ele?",
      };
    } else {
      parsed.district = matches[0].district;
      if (cities.length > 1 && !parsed.city)
        question ??= {
          kind: "location",
          cities: cities.slice(0, 30),
          district: matches[0].district,
        };
      else if (!parsed.city) parsed.city = matches[0].city;
    }
  }
  return { filters: parsed, question, rejected };
}
export function nextQuestion(draft: SearchDraft): BotQuestion | null {
  const f = draft.filters;
  if (f.reference) return null;
  if (!f.operation) return { kind: "operation" };
  if (!draft.countsAnswered && f.bedrooms == null && f.bathrooms == null) return { kind: "counts" };
  if (!draft.budgetAnswered && f.budget == null) return { kind: "budget", operation: f.operation };
  return null;
}
export function questionText(question: BotQuestion): string {
  switch (question.kind) {
    case "operation":
      return "Você procura um imóvel para comprar ou alugar?";
    case "counts":
      return "Quantos quartos e banheiros você procura?";
    case "budget":
      return question.operation === "aluguel"
        ? "Até quanto você pretende pagar de aluguel por mês?"
        : "Até quanto você pretende investir?";
    case "location":
      return `Em qual cidade fica o bairro ${question.district} que você procura?`;
    case "clarify":
      return question.message;
  }
}
/** Search considers the full projection in SQL. No first-page/client-side catalog filtering. */
export async function searchPublicProperties(
  repo: PublicRepository,
  brand: BotBrand,
  filters: SearchFilters,
  central: string,
  signal?: AbortSignal,
): Promise<BotCard[]> {
  const candidates = (await repo.candidates(brand, filters, signal)).map((d) =>
    documentSchema.parse(d),
  );
  const ranked = rankDocuments(candidates, brand, filters);
  if (!ranked.length) return [];
  // The second restricted read closes withdrawal/update races during ranking.
  const current = (
    await repo.resolve(
      brand,
      ranked.map((r) => r.document.property.id),
      signal,
    )
  ).map((d) => documentSchema.parse(d));
  const versions = new Map(ranked.map((r) => [r.document.property.id, r.document.version]));
  return rankDocuments(
    current.filter((d) => versions.get(d.property.id) === d.version),
    brand,
    filters,
  ).map(({ document, differences }) => {
    const card = toCard(document, central, differences);
    const requestedFeatures = filters.features
      .flatMap((f) => {
        const e = featureEvidence(document.property, f.name, f.scope);
        if (e.state !== "present") return [];
        return [
          `${f.name.charAt(0).toUpperCase()}${f.name.slice(1)}${f.scope === "condominium" ? " no condomínio" : " privativa"}`,
        ];
      })
      .slice(0, 2);
    if (requestedFeatures.length) card.features = requestedFeatures;
    return card;
  });
}
export function resultsAnswer(cards: BotCard[]): string {
  if (!cards.length)
    return "Não encontrei opções com todos esses critérios. Quer ajustar um filtro ou falar com nossa equipe pelo WhatsApp?";
  if (cards[0].alternative.length)
    return "Estas alternativas próximas têm uma diferença nas suas preferências, indicada em cada imóvel. Quer ajustar a busca?";
  return cards.length === 1
    ? "Encontrei esta opção para sua busca. Quer refinar por bairro ou algum diferencial?"
    : `Encontrei ${cards.length} opções para sua busca. Quer refinar por bairro ou algum diferencial?`;
}
