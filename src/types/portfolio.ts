export type PortfolioProviderFilter = "todos" | "cordial" | "morar" | "ambos";
export type PortfolioOperationFilter = "todos" | "venda" | "aluguel";

export type PortfolioSummary = {
  uniqueProperties: number;
  saleProperties: number;
  rentalProperties: number;
  cordialProperties: number;
  morarProperties: number;
  bothProviders: number;
  missingRegion: number;
};

export type PortfolioRegion = {
  key: string;
  label: string;
  uniqueCount: number;
  percentage: number;
  saleCount: number;
  rentalCount: number;
  cordialCount: number;
  morarCount: number;
  bothProvidersCount: number;
};

export type PortfolioTopValueItem = {
  rank: number;
  id: string;
  valor: number;
  tipo: string | null;
  regionLabel: string | null;
  operacao: "venda" | "aluguel";
  codigo: string | null;
  codigoCordial: string | null;
  codigoMorar: string | null;
  inCordial: boolean;
  inMorar: boolean;
};

export type PortfolioAnalytics = {
  summary: PortfolioSummary;
  regions: PortfolioRegion[];
  topValues: {
    sale: PortfolioTopValueItem[];
    rental: PortfolioTopValueItem[];
  };
};

export const EMPTY_PORTFOLIO_ANALYTICS: PortfolioAnalytics = {
  summary: {
    uniqueProperties: 0,
    saleProperties: 0,
    rentalProperties: 0,
    cordialProperties: 0,
    morarProperties: 0,
    bothProviders: 0,
    missingRegion: 0,
  },
  regions: [],
  topValues: { sale: [], rental: [] },
};

export type PortfolioInsight = {
  id: string;
  text: string;
  tone: "neutral" | "cordial" | "morar" | "attention";
};

/** Insights determinísticos: mesmo recorte ⇒ mesmas frases, sempre numéricas. */
export function buildPortfolioInsights(data: PortfolioAnalytics): PortfolioInsight[] {
  const { summary, regions } = data;
  const total = summary.uniqueProperties;
  if (total === 0) return [];

  const insights: PortfolioInsight[] = [];
  const leader = regions[0];

  if (leader && leader.percentage >= 5) {
    insights.push({
      id: "concentracao",
      text: `${leader.label} concentra ${leader.percentage.toLocaleString("pt-BR")}% do portfólio (${leader.uniqueCount} imóveis).`,
      tone: "neutral",
    });
  }

  if (summary.saleProperties > 0 && summary.rentalProperties > 0) {
    const share = Math.round((summary.saleProperties / total) * 100);
    insights.push({
      id: "operacao",
      text: `Venda responde por ${share}% do portfólio; aluguel soma ${summary.rentalProperties} imóveis.`,
      tone: "neutral",
    });
  }

  if (leader && leader.cordialCount !== leader.morarCount) {
    const cordialAhead = leader.cordialCount > leader.morarCount;
    insights.push({
      id: "provedor-lider",
      text: `Em ${leader.label}, ${cordialAhead ? "Cordial" : "Morar"} lidera com ${
        cordialAhead ? leader.cordialCount : leader.morarCount
      } imóveis contra ${cordialAhead ? leader.morarCount : leader.cordialCount}.`,
      tone: cordialAhead ? "cordial" : "morar",
    });
  }

  if (insights.length < 3 && summary.missingRegion > 0) {
    insights.push({
      id: "sem-bairro",
      text: `${summary.missingRegion} ${summary.missingRegion === 1 ? "imóvel está" : "imóveis estão"} sem bairro informado e ficam fora do ranking.`,
      tone: "attention",
    });
  }

  return insights.slice(0, 3);
}
