export type PropertyCarteira = "cordial" | "morar";
export type PropertyOperacao = "venda" | "aluguel";
export type PropertyValorModo = "fixo" | "consulte";

export type PropertyPublicationBadge = {
  provider: PropertyCarteira;
  status: string;
  externalPropertyId: string | null;
};

export type Property = {
  id: string;

  carteira: PropertyCarteira;
  operacao: PropertyOperacao;
  tipo: string | null;
  localizacaoExibida: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  valor: number | null;
  valorModo: PropertyValorModo;
  valorExibido: string | null;
  dormitorios: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  areaPrincipal: number | null;
  areaTipo: string | null;
  areaTotal: number | null;
  areaUtil: number | null;
  areaConstruida: number | null;
  areaTerreno: number | null;
  codigo: string | null;
  source: string;
  sourcePropertyId: string;
  sourceCatalogPage: number | null;
  sourcePropertyUrl: string | null;
  sourceCatalogUrl: string | null;
  sourceImportBatch: string | null;
  createdAt: string;
};

export const NAO_INFORMADO = "Não informado no catálogo";

export function propertyLocalidade(p: Property): string | null {
  const parts = [p.bairro, [p.cidade, p.uf].filter(Boolean).join(" / ")].filter(
    (v) => v && v.trim().length > 0,
  );
  return parts.length ? parts.join(" · ") : null;
}

export function formatArea(value: number | null): string | null {
  if (value === null || value === undefined) return null;
  const formatted = value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return `${formatted} m²`;
}
