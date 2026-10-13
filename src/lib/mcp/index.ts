import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchProperties from "./tools/search-properties";
import searchClients from "./tools/search-clients";
import listAttendances from "./tools/list-attendances";
import portfolioSummary from "./tools/portfolio-summary";
import rentalsFinancialSummary from "./tools/rentals-financial-summary";
import crmFunnel from "./tools/crm-funnel";
import marketingPerformance from "./tools/marketing-performance";
import businessInsights from "./tools/business-insights";

// Vite inlines the stable ref; the published SUPABASE_URL may be a proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "gestao-cordial",
  title: "Gestão Cordial",
  version: "0.2.0",
  instructions:
    "Ferramentas somente leitura do Gestão Cordial para buscar dados e apresentar insights do negócio: resumo da carteira de imóveis, financeiro de aluguéis e NFS-e, funil de atendimentos, desempenho de marketing e insights automáticos, além de buscas de imóveis, clientes e atendimentos. Tudo limitado ao que o usuário conectado pode ver no app.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    businessInsights,
    portfolioSummary,
    rentalsFinancialSummary,
    crmFunnel,
    marketingPerformance,
    searchProperties,
    searchClients,
    listAttendances,
  ],
});
