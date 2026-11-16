import { normalizeText } from "./state";
import type { ModelProperty } from "./contracts";
export type Evidence = { state: "present" | "absent" | "unknown"; evidence: string | null };
const amenities = "piscina|churrasqueira|sala|cozinha";
const uncertainty =
  /espaco para|possibilidade|projeto|construir|pode (ter|instalar)|futura|previsao|preparacao|nao informad|nao confirmad|sem informacao|nao (?:ha|tem|possui) (?:informacao|indicacao|confirmacao)/;
const condominium = /condominio|condominial|compartilhad|coletiv/;
const privateScope = /privativ[ao]|particular|do imovel|da casa/;
/** Evidence is local to a feature clause. Missing/conflicting scope stays unknown. */
export function featureEvidence(
  p: Pick<ModelProperty, "features" | "description">,
  name: string,
  scope: "private" | "condominium",
): Evidence {
  if (!new RegExp(`^(?:${amenities})$`).test(name)) return { state: "unknown", evidence: null };
  const word = new RegExp(`\\b${name}\\b`);
  const snippets = [...p.features, ...p.description.split(/[.;\n]/)].filter((s) =>
    word.test(normalizeText(s)),
  );
  const found: Array<{ state: "present" | "absent"; evidence: string }> = [];
  for (const original of snippets) {
    const whole = normalizeText(original);
    if (/(ignore|instrucoes|system|prompt|senha|token|proprietario|cpf|comissao)/.test(whole))
      continue;
    const count = (whole.match(new RegExp(`\\b(?:${amenities})\\b`, "g")) ?? []).length;
    // A conjunction introducing another amenity establishes a new evidence scope.
    const clauses = whole.split(
      new RegExp(
        `(?:,?\\s+(?:e|mas)\\s+|,\\s*)(?=(?:(?:com|sem|uma?|nao ha|nao possui|nao tem)\\s+)*(?:${amenities})\\b)`,
      ),
    );
    for (const clause of clauses) {
      if (!word.test(clause) || uncertainty.test(clause)) continue;
      const directPrivate = new RegExp(`\\b${name} (?:privativ[ao]|particular)\\b`).test(clause);
      const inCondo = condominium.test(clause) && !directPrivate,
        inPrivate = privateScope.test(clause);
      if (inCondo && inPrivate) continue;
      if (!inCondo && !inPrivate && condominium.test(whole) && count > 1) continue;
      if ((scope === "condominium") !== inCondo) continue;
      const before = new RegExp(
        `(?:sem|nao (?:tem|ha|possui|inclui|conta com|dispoe de)) (?:uma? )?${name}\\b`,
      );
      const after = new RegExp(
        `\\b${name} (?:inexistente|ausente|nao (?:existe|disponivel|informada))\\b`,
      );
      const negative = before.test(clause) || after.test(clause);
      const affirmative =
        p.features.includes(original) ||
        new RegExp(
          `(?:com|possui|tem|conta com|dispoe de|oferece) (?:\\w+ ){0,2}${name}\\b|\\b${name} (?:privativa|existente|no condominio)`,
        ).test(clause);
      if (negative || affirmative)
        found.push({
          state: negative ? "absent" : "present",
          evidence: original.trim().slice(0, 200),
        });
    }
  }
  if (!found.length || new Set(found.map((e) => e.state)).size > 1)
    return { state: "unknown", evidence: null };
  return found[0];
}
