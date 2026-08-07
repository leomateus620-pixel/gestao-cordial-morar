export type BuscaCategoria =
  | "atendimento"
  | "cliente"
  | "aluguel"
  | "venda"
  | "agenciamento"
  | "imovel"
  | "inquilino";

export type BuscaCategoriaFiltro = "todos" | BuscaCategoria;

export type BuscaResultado = {
  id: string;
  categoria: BuscaCategoria;
  titulo: string;
  subtitulo: string;
  detalhe?: string;
  status?: string;
  data?: string;
  rota: string;
};

export type BuscaTimelineEvento = {
  id: string;
  data: string | null;
  titulo: string;
  descricao?: string;
  tag?: string;
};

export type BuscaTimelineCampo = {
  label: string;
  valor: string;
};

export type BuscaTimeline = {
  categoria: BuscaCategoria;
  id: string;
  titulo: string;
  subtitulo: string;
  status?: string;
  rota: string;
  campos: BuscaTimelineCampo[];
  eventos: BuscaTimelineEvento[];
};

export const buscaCategoriaLabels: Record<BuscaCategoria, string> = {
  atendimento: "Atendimentos",
  cliente: "Clientes",
  aluguel: "Aluguéis",
  venda: "Vendas",
  agenciamento: "Agenciamentos",
  imovel: "Imóveis de locação",
  inquilino: "Inquilinos",
};

export const buscaCategoriaOrdem: BuscaCategoria[] = [
  "atendimento",
  "cliente",
  "aluguel",
  "venda",
  "agenciamento",
  "imovel",
  "inquilino",
];

export function formatBuscaDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatBuscaDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBuscaCurrency(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}
