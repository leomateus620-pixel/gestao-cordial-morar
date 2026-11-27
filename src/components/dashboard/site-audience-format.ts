import type { AudiencePeriod } from "@/lib/site-audience/report";

const locale = "pt-BR";
const timeZone = "America/Sao_Paulo";
const count = new Intl.NumberFormat(locale);
const date = new Intl.DateTimeFormat(locale, { timeZone, day: "numeric", month: "short" });
const dateYear = new Intl.DateTimeFormat(locale, {
  timeZone,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const time = new Intl.DateTimeFormat(locale, {
  timeZone,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const month = new Intl.DateTimeFormat(locale, { timeZone, month: "long", year: "numeric" });
const chartHour = new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", hourCycle: "h23" });
const chartDate = new Intl.DateTimeFormat(locale, { timeZone, day: "2-digit", month: "2-digit" });

export function n(value: number | null | undefined) {
  return value == null ? "—" : count.format(value);
}

export function formatAudienceDate(value: string, withTime = false) {
  const instant = new Date(value);
  return withTime ? `${date.format(instant)} às ${time.format(instant)}` : dateYear.format(instant);
}

export function formatAudienceRange(from: string, to: string, period: AudiencePeriod) {
  const start = new Date(from);
  if (period === "day") return dateYear.format(start);
  if (period === "month") return month.format(start);
  const end = new Date(new Date(to).getTime() - 1);
  return `${date.format(start)} – ${dateYear.format(end)}`;
}

export function formatAudienceBucket(value: string, period: AudiencePeriod) {
  const instant = new Date(value);
  return period === "day" ? `${chartHour.format(instant)}h` : chartDate.format(instant);
}

export function routeLabel(key: string) {
  return routeLabels[key] ?? "Outras páginas";
}

const routeLabels: Record<string, string> = {
  home: "Página inicial",
  inicio: "Página inicial",
  início: "Página inicial",
  comprar: "Comprar",
  buy: "Comprar",
  aluguel: "Alugar",
  alugar: "Alugar",
  rent: "Alugar",
  busca: "Busca",
  buscar: "Busca",
  search: "Busca",
  bairros: "Bairros",
  districts: "Bairros",
  noticias: "Notícias",
  news: "Notícias",
  noticia: "Notícias",
  contato: "Contato",
  contact: "Contato",
  anuncie: "Anuncie",
  advertise: "Anuncie",
  imovel: "Fichas de imóveis",
  property: "Fichas de imóveis",
  favoritos: "Favoritos",
  favorites: "Favoritos",
  selecao: "Seleção",
  selection: "Seleção",
  informacoes: "Informações",
  information: "Informações",
  sobre: "Sobre",
  about: "Sobre",
  financing: "Financiamento",
  correspondent: "Correspondente",
  privacidade: "Privacidade",
  privacy: "Privacidade",
  other: "Outras páginas",
  outros: "Outras páginas",
};
