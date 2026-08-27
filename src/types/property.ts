export type PropertyCarteira = "cordial" | "morar";
export type PropertyOperacao = "venda" | "aluguel";
export type PropertyValorModo = "fixo" | "consulte";

export type PropertyPublicationBadge = {
  provider: PropertyCarteira;
  status: string;
  externalPropertyId: string | null;
  /** URL pública canônica confirmada pelo site — nunca montada localmente. */
  publicUrl?: string | null;
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
  coverUrl: string | null;
  publications: PropertyPublicationBadge[];
  removalState: string | null;
  archivedAt: string | null;
};

export type PropertyImage = {
  id: string;
  url: string;
  isCover: boolean;
  position: number;
};

/** Campos editáveis pelo formulário de cadastro/edição. */
export type PropertyWriteInput = {
  carteira: PropertyCarteira;
  operacao: PropertyOperacao;
  finalidade: string | null;
  tipo: string | null;
  codigo: string | null;
  referencia: string | null;
  localizacaoExibida: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  zona: string | null;
  regiao: string | null;
  dormitorios: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  salas: number | null;
  areaPrincipal: number | null;
  areaTipo: string | null;
  areaTotal: number | null;
  areaUtil: number | null;
  areaConstruida: number | null;
  areaTerreno: number | null;
  mobiliado: boolean | null;
  valor: number | null;
  valorModo: PropertyValorModo;
  valorIptu: number | null;
  valorCondominio: number | null;
  aceitaFinanciamento: boolean | null;
  permuta: boolean | null;
  descricaoImovel: string | null;
  pontosFortes: string | null;
  exclusividade: boolean | null;
  autorizacao: boolean | null;
  escriturada: boolean | null;
  averbada: boolean | null;
  comPlaca: boolean | null;
  disponibilidade: string | null;
  exibirImovel: boolean | null;
  destaqueInicial: boolean | null;
  proprietarioNome: string | null;
  origemCaptacao: string | null;
  nomeEmpreendimento: string | null;
  unidade: string | null;
};

export type PropertyDetail = Property &
  PropertyWriteInput & {
    revision: number;
    updatedAt: string | null;
    isDraft: boolean;
    images: PropertyImage[];
  };


export const PUBLICATION_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  pending: "Pendente",
  syncing: "Sincronizando",
  published: "Publicado",
  partial: "Parcial",
  error: "Erro",
  out_of_sync: "Divergente",
  unpublished: "Despublicado",
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
