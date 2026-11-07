/**
 * Destinos de publicação nos sites próprios. Fonte única usada por formulário,
 * conclusão, marca d'água, publicação e recuperação.
 * "ambas"/"ambos" vira as duas marcas; nada é duplicado nem inventado.
 */
export type OwnedDestination = "cordial" | "morar";

const ORDER: OwnedDestination[] = ["cordial", "morar"];

export function normalizeDestinations(input: readonly (string | null | undefined)[] | null | undefined): OwnedDestination[] {
  const set = new Set<OwnedDestination>();
  for (const raw of input ?? []) {
    const v = String(raw ?? "").trim().toLowerCase();
    if (v === "cordial") set.add("cordial");
    else if (v === "morar") set.add("morar");
    else if (v === "ambas" || v === "ambos" || v === "both") {
      set.add("cordial");
      set.add("morar");
    }
  }
  return ORDER.filter((d) => set.has(d));
}

/** Canais afetados por uma troca de destino: só eles mudam. */
export function destinationChanges(before: readonly string[], after: readonly string[]) {
  const a = normalizeDestinations(before);
  const b = normalizeDestinations(after);
  return {
    added: b.filter((d) => !a.includes(d)),
    removed: a.filter((d) => !b.includes(d)),
  };
}
