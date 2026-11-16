import type { FilterPatch } from "./contracts";
const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const count = (value: NonNullable<FilterPatch["bedrooms"]>, label: string) => {
  const prefix = { eq: "", gte: "", gt: "mais de ", lt: "menos de ", lte: "até " }[value.op];
  return `${prefix}${value.value}${value.op === "gte" ? "+" : ""} ${label}`;
};
/** Deterministic summaries of recorded evidence; no paid model or invented visitor intent. */
export function describeSearch(filters: FilterPatch): string {
  const parts: string[] = [];
  if (filters.operation) parts.push(filters.operation === "venda" ? "Compra" : "Aluguel");
  if (filters.type) parts.push(filters.type);
  if (filters.district || filters.city)
    parts.push([filters.district, filters.city].filter(Boolean).join(", "));
  if (filters.reference) parts.push(`REF ${filters.reference}`);
  const budget = filters.budget;
  if (budget?.min)
    parts.push(`${budget.min.inclusive ? "a partir de" : "acima de"} ${money(budget.min.value)}`);
  if (budget?.max)
    parts.push(`${budget.max.inclusive ? "até" : "abaixo de"} ${money(budget.max.value)}`);
  if (budget && filters.operation === "aluguel") parts.push("por mês");
  for (const [key, label] of [
    ["bedrooms", "quartos"],
    ["bathrooms", "banheiros"],
    ["suites", "suítes"],
    ["parking", "vagas"],
  ] as const) {
    if (filters[key]) parts.push(count(filters[key]!, label));
  }
  if (filters.furnished != null) parts.push(filters.furnished ? "mobiliado" : "sem mobília");
  if (filters.financing != null)
    parts.push(filters.financing ? "aceita financiamento" : "sem financiamento");
  if (filters.exchange != null) parts.push(filters.exchange ? "aceita permuta" : "sem permuta");
  if (filters.stage) parts.push(filters.stage);
  for (const feature of filters.features ?? [])
    parts.push(
      `${feature.state === "present" ? "com" : "sem"} ${feature.name}${feature.scope === "condominium" ? " no condomínio" : " privativa"}`,
    );
  if (filters.area) {
    const areas = { util: "útil", total: "total", construida: "construída", terreno: "do terreno" };
    const { min, max } = filters.area.range;
    parts.push(
      `área ${areas[filters.area.kind]}${min ? ` ${min.inclusive ? "a partir de" : "acima de"} ${min.value} m²` : ""}${max ? ` ${max.inclusive ? "até" : "abaixo de"} ${max.value} m²` : ""}`,
    );
  }
  return parts.length ? parts.join(" · ") : "Preferências ainda não definidas";
}
