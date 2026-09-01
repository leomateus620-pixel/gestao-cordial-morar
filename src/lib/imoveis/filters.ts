import type { ImoveisSort, ListImoveisInput } from "./imoveis.functions";

export type CatalogFilters = {
  q: string;
  carteira: "todas" | "cordial" | "morar" | "ambas";
  operacao: "todos" | "venda" | "aluguel";
  tipo: string;
  cidade: string;
  bairro: string;
  valorMin: number | null;
  valorMax: number | null;
  dormitoriosMin: number | null;
  suitesMin: number | null;
  banheirosMin: number | null;
  vagasMin: number | null;
  areaMin: number | null;
  areaMax: number | null;
  status: string;
  /** "ocultar" = catálogo ativo (padrão) · "somente" = imóveis arquivados. */
  arquivados: "ocultar" | "somente";
  sort: ImoveisSort;
  page: number;
};

export const DEFAULT_FILTERS: CatalogFilters = {
  q: "",
  carteira: "todas",
  operacao: "todos",
  tipo: "",
  cidade: "",
  bairro: "",
  valorMin: null,
  valorMax: null,
  dormitoriosMin: null,
  suitesMin: null,
  banheirosMin: null,
  vagasMin: null,
  areaMin: null,
  areaMax: null,
  status: "",
  arquivados: "ocultar",
  sort: "recentes",
  page: 0,
};

const SORTS: ImoveisSort[] = ["recentes", "codigo", "preco_asc", "preco_desc", "area_desc"];

function text(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 120) : "";
}

function number(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

/** Lê os filtros da URL, sempre devolvendo valores seguros. */
export function parseCatalogSearch(search: Record<string, unknown>): CatalogFilters {
  const page = number(search["page"]);
  return {
    q: text(search["q"]),
    carteira: oneOf(search["carteira"], ["todas", "cordial", "morar", "ambas"] as const, "todas"),
    operacao: oneOf(search["operacao"], ["todos", "venda", "aluguel"] as const, "todos"),
    tipo: text(search["tipo"]),
    cidade: text(search["cidade"]),
    bairro: text(search["bairro"]),
    valorMin: number(search["valorMin"]),
    valorMax: number(search["valorMax"]),
    dormitoriosMin: number(search["dormitoriosMin"]),
    suitesMin: number(search["suitesMin"]),
    banheirosMin: number(search["banheirosMin"]),
    vagasMin: number(search["vagasMin"]),
    areaMin: number(search["areaMin"]),
    areaMax: number(search["areaMax"]),
    status: text(search["status"]),
    arquivados: oneOf(search["arquivados"], ["ocultar", "somente"] as const, "ocultar"),
    sort: oneOf(search["sort"], SORTS, "recentes"),
    page: page === null ? 0 : Math.min(9999, Math.floor(page)),
  };
}

/** Mantém a URL curta: só o que difere do padrão vai para os parâmetros. */
export function serializeCatalogSearch(filters: CatalogFilters): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_FILTERS) as Array<keyof CatalogFilters>) {
    const value = filters[key];
    if (value === null || value === "" || value === DEFAULT_FILTERS[key]) continue;
    out[key] = value;
  }
  return out;
}

export function toListInput(filters: CatalogFilters, pageSize: number): ListImoveisInput {
  return {
    carteira: filters.carteira,
    operacao: filters.operacao,
    tipo: filters.tipo || null,
    cidade: filters.cidade || null,
    bairro: filters.bairro || null,
    search: filters.q.trim() || null,
    valorMin: filters.valorMin,
    valorMax: filters.valorMax,
    dormitoriosMin: filters.dormitoriosMin,
    suitesMin: filters.suitesMin,
    banheirosMin: filters.banheirosMin,
    vagasMin: filters.vagasMin,
    areaMin: filters.areaMin,
    areaMax: filters.areaMax,
    statusPublicacao: filters.status || null,
    arquivados: filters.arquivados,
    sort: filters.sort,
    page: filters.page,
    pageSize,
  };
}

export type ActiveChip = { key: keyof CatalogFilters; label: string };

export function activeChips(filters: CatalogFilters): ActiveChip[] {
  const chips: ActiveChip[] = [];
  const push = (key: keyof CatalogFilters, label: string) => chips.push({ key, label });
  if (filters.carteira !== "todas")
    push(
      "carteira",
      filters.carteira === "ambas"
        ? "Cordial + Morar"
        : filters.carteira === "cordial"
          ? "Cordial"
          : "Morar",
    );
  if (filters.operacao !== "todos") push("operacao", filters.operacao === "venda" ? "Venda" : "Aluguel");
  if (filters.tipo) push("tipo", filters.tipo);
  if (filters.cidade) push("cidade", filters.cidade);
  if (filters.bairro) push("bairro", filters.bairro);
  if (filters.status) push("status", `Status: ${filters.status}`);
  if (filters.valorMin !== null) push("valorMin", `A partir de R$ ${filters.valorMin.toLocaleString("pt-BR")}`);
  if (filters.valorMax !== null) push("valorMax", `Até R$ ${filters.valorMax.toLocaleString("pt-BR")}`);
  if (filters.dormitoriosMin !== null) push("dormitoriosMin", `${filters.dormitoriosMin}+ dorm.`);
  if (filters.suitesMin !== null) push("suitesMin", `${filters.suitesMin}+ suítes`);
  if (filters.banheirosMin !== null) push("banheirosMin", `${filters.banheirosMin}+ banheiros`);
  if (filters.vagasMin !== null) push("vagasMin", `${filters.vagasMin}+ vagas`);
  if (filters.areaMin !== null) push("areaMin", `Área ≥ ${filters.areaMin} m²`);
  if (filters.areaMax !== null) push("areaMax", `Área ≤ ${filters.areaMax} m²`);
  return chips;
}

export function countActiveAdvanced(filters: CatalogFilters): number {
  const keys: Array<keyof CatalogFilters> = [
    "bairro",
    "dormitoriosMin",
    "suitesMin",
    "banheirosMin",
    "vagasMin",
    "areaMin",
    "areaMax",
    "status",
  ];
  return keys.filter((key) => {
    const value = filters[key];
    return value !== null && value !== "" && value !== DEFAULT_FILTERS[key];
  }).length;
}
