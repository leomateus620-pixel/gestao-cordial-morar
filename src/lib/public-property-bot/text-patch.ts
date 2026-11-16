import type { FilterPatch, SearchFilters } from "./contracts";
import { normalizeText } from "./state";

const aliases: Partial<Record<keyof SearchFilters, string>> = {
  operation: "finalidade|compra|venda|aluguel",
  type: "tipo|categoria",
  city: "cidade|municipio",
  district: "bairro|loteamento|regiao",
  reference: "referencia|codigo",
  budget: "orcamento|preco|valor|limite|faixa|teto",
  bedrooms: "quartos?|dormitorios?",
  bathrooms: "banheiros?",
  suites: "suites?",
  parking: "vagas?|garagem",
  area: "area|metragem|tamanho",
  furnished: "mobilia|mobiliado|moveis",
  financing: "financiamento|financiar",
  exchange: "permuta|troca",
  stage: "estagio|construcao|pronto|planta",
};
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A model cannot erase existing requirements merely by returning omitted fields as null. */
export function guardTextPatch(
  patch: FilterPatch,
  current: SearchFilters,
  text: string,
): FilterPatch {
  const safe = { ...patch };
  const normalized = normalizeText(text);
  for (const field of Object.keys(aliases) as Array<keyof typeof aliases>) {
    if (safe[field] !== null || current[field] == null) continue;
    if (
      field === "budget" &&
      /\bsem(?: nenhum)? (?:limite|teto)(?: de (?:preco|valor|orcamento))?\b/.test(normalized)
    )
      continue;
    const old = current[field];
    const target = `${aliases[field]}${["city", "district", "reference"].includes(field) && typeof old === "string" ? `|${escape(normalizeText(old))}` : ""}`;
    const explicit = new RegExp(
      `\\b(?:retir[a-z]*|remov[a-z]*|desconsider[a-z]*|limp[a-z]*|esquec[a-z]*|tirar|tire|tira|nao (?:precisa|preciso|necessita|necessito|importa)|sem preferencia|qualquer|indiferente)(?:\\s+(?:o|a|os|as|de|do|da|dos|das|por|pela|pelo|quanto|ao|ser|ter|ficar|em|no|na|filtro|numero|quantidade|\\d+)){0,5}\\s+(?:${target})\\b|\\b(?:${target})(?:\\s+(?:e|eh|para mim)){0,2}\\s+(?:indiferente|tanto faz|sem preferencia)\\b`,
    );
    if (!explicit.test(normalized)) delete safe[field];
  }
  if (safe.features) {
    safe.features = safe.features.flatMap((feature) => {
      const clause = normalized
        .split(/[.;!?]/)
        .find((part) => new RegExp(`\\b${feature.name}\\b`).test(part));
      if (!clause) return [];
      const flexible = /\b(?:opcional|flexivel|preferencialmente|se possivel|se tiver)\b/.test(
        clause,
      );
      return [{ ...feature, required: feature.required || !flexible }];
    });
  }
  return safe;
}
