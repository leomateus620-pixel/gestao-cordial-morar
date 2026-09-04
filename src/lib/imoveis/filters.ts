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

export const OPERACAO_OPTIONS: Array<{ value: CatalogFilters["operacao"]; label: string }> = [
  { value: "todos", label: "Venda e aluguel" },
  { value: "venda", label: "Venda" },
  { value: "aluguel", label: "Aluguel" },
];

export const SORT_OPTIONS: Array<{ value: ImoveisSort; label: string }> = [
  { value: "recentes", label: "Mais recentes" },
  { value: "codigo", label: "Código" },
  { value: "preco_asc", label: "Menor preço" },
  { value: "preco_desc", label: "Maior preço" },
  { value: "area_desc", label: "Maior área" },
];

export const ARQUIVADOS_OPTIONS: Array<{ value: CatalogFilters["arquivados"]; label: string }> = [
  { value: "ocultar", label: "Catálogo ativo" },
  { value: "somente", label: "Arquivados" },
];

export const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Qualquer status" },
  { value: "published", label: "Publicado" },
  { value: "pending", label: "Pendente" },
  { value: "error", label: "Com erro" },
  { value: "out_of_sync", label: "Divergente" },
  { value: "draft", label: "Rascunho" },
];

export const PRICE_PRESETS: Array<{ label: string; min: number | null; max: number | null }> = [
  { label: "Até R$ 200 mil", min: null, max: 200_000 },
  { label: "R$ 200 – 350 mil", min: 200_000, max: 350_000 },
  { label: "R$ 350 – 500 mil", min: 350_000, max: 500_000 },
  { label: "R$ 500 – 600 mil", min: 500_000, max: 600_000 },
  { label: "R$ 600 – 800 mil", min: 600_000, max: 800_000 },
  { label: "R$ 800 mil – 1 mi", min: 800_000, max: 1_000_000 },
  { label: "Acima de R$ 1 mi", min: 1_000_000, max: null },
];

/** Valores em reais de forma curta, para caber em chips: 350 mil, 1,2 mi. */
export function shortBRL(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `R$ ${m.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `R$ ${k.toLocaleString("pt-BR", { maximumFractionDigits: k % 1 === 0 ? 0 : 1 })} mil`;
  }
  return `R$ ${value.toLocaleString("pt-BR")}`;
}

/** Rótulo curto da faixa de valor selecionada (ou null sem faixa). */
export function priceRangeLabel(valorMin: number | null, valorMax: number | null): string | null {
  if (valorMin === null && valorMax === null) return null;
  if (valorMin !== null && valorMax !== null)
    return `${shortBRL(valorMin)} – ${shortBRL(valorMax)}`;
  if (valorMin !== null) return `A partir de ${shortBRL(valorMin)}`;
  return `Até ${shortBRL(valorMax as number)}`;
}

export function statusLabel(value: string): string {
  return STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

/** Quantos filtros (além da busca, carteira, ordenação e página) estão ativos. */
export function countActiveFilters(filters: CatalogFilters): number {
  const keys: Array<keyof CatalogFilters> = [
    "operacao",
    "tipo",
    "cidade",
    "bairro",
    "valorMin",
    "valorMax",
    "dormitoriosMin",
    "suitesMin",
    "banheirosMin",
    "vagasMin",
    "areaMin",
    "areaMax",
    "status",
    "arquivados",
  ];
  return keys.filter((key) => {
    const value = filters[key];
    return value !== null && value !== "" && value !== DEFAULT_FILTERS[key];
  }).length;
}

export type ActiveChip = { key: keyof CatalogFilters; label: string };

export function activeChips(filters: CatalogFilters): ActiveChip[] {
  const chips: ActiveChip[] = [];
  const push = (key: keyof CatalogFilters, label: string) => chips.push({ key, label });
  if (filters.arquivados === "somente") push("arquivados", "Arquivados");
  if (filters.carteira !== "todas")
    push(
      "carteira",
      filters.carteira === "ambas"
        ? "Cordial + Morar"
        : filters.carteira === "cordial"
          ? "Cordial"
          : "Morar",
    );
  if (filters.operacao !== "todos")
    push("operacao", filters.operacao === "venda" ? "Venda" : "Aluguel");
  if (filters.tipo) push("tipo", filters.tipo);
  if (filters.cidade) push("cidade", filters.cidade);
  if (filters.bairro) push("bairro", filters.bairro);
  if (filters.status) push("status", `Status: ${statusLabel(filters.status)}`);
  if (filters.valorMin !== null) push("valorMin", `A partir de ${shortBRL(filters.valorMin)}`);
  if (filters.valorMax !== null) push("valorMax", `Até ${shortBRL(filters.valorMax)}`);
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
