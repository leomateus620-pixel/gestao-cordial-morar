// Endereço amigável e SEO automático do imóvel (puro, usado no site, sitemap e redirecionamentos).
// Formato: /imovel/<tipo>-<finalidade>-<n>-quartos-<bairro>-<cidade>-ref-<referência>-<id público>.
// O id público (uuid) no final garante unicidade por marca; o texto antes dele é só descritivo.
const UUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export type SlugInput = {
  id: string;
  reference?: string | null;
  operation?: "venda" | "aluguel" | string | null;
  type?: string | null;
  district?: string | null;
  city?: string | null;
  bedrooms?: number | null;
};

export function slugify(input: string | null | undefined, max = 60): string {
  const s = (input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, max).replace(/-+$/, "");
}

export function propertySlug(p: SlugInput): string {
  const parts = [
    slugify(p.type, 30),
    p.operation === "venda" ? "a-venda" : p.operation === "aluguel" ? "para-alugar" : "",
    p.bedrooms ? `${p.bedrooms}-quarto${p.bedrooms > 1 ? "s" : ""}` : "",
    slugify(p.district, 40),
    slugify(p.city, 40),
    p.reference ? `ref-${slugify(p.reference, 20)}` : "",
  ].filter(Boolean);
  return [...parts, p.id.toLowerCase()].join("-").replace(/-+/g, "-");
}

/** Extrai o id público de um parâmetro de rota (uuid puro ou endereço amigável). */
export function parsePropertyParam(param: string): string | null {
  const m = UUID.exec(param.trim());
  return m ? m[1].toLowerCase() : null;
}

/** Verdadeiro quando o parâmetro recebido não é o endereço oficial (precisa de 301). */
export function needsSlugRedirect(param: string, p: SlugInput): boolean {
  return param !== propertySlug(p);
}

const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export type SeoInput = SlugInput & {
  price?: number | null;
  priceMode?: string | null;
  areas?: { util?: number | null; total?: number | null; construida?: number | null } | null;
};

/** Título e descrição automáticos; nunca inventam dados ausentes. */
export function autoPropertySeo(p: SeoInput): { title: string; description: string } {
  const type = p.type?.trim() || "Imóvel";
  const op = p.operation === "venda" ? "à venda" : p.operation === "aluguel" ? "para alugar" : "";
  const where = [p.district, p.city].filter(Boolean).join(", ");
  const rooms = p.bedrooms ? `${p.bedrooms} quarto${p.bedrooms > 1 ? "s" : ""}` : "";
  const title = [
    [type, rooms && `com ${rooms}`, op].filter(Boolean).join(" "),
    where && `em ${where}`,
  ]
    .filter(Boolean)
    .join(" ");
  const area = p.areas?.util ?? p.areas?.construida ?? p.areas?.total ?? null;
  const price =
    p.priceMode === "fixo" && p.price
      ? `${money(p.price)}${p.operation === "aluguel" ? "/mês" : ""}`
      : "";
  const description = [
    `${type}${op ? ` ${op}` : ""}${where ? ` em ${where}` : ""}`,
    rooms,
    area ? `${area} m²` : "",
    price,
    p.reference ? `Ref. ${p.reference}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    title: title.slice(0, 70),
    description: `${description}. Fale com a nossa equipe.`.slice(0, 160),
  };
}
