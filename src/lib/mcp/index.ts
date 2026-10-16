import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchProperties from "./tools/search-properties";
import searchClients from "./tools/search-clients";
import listAttendances from "./tools/list-attendances";
import portfolioSummary from "./tools/portfolio-summary";
import rentalsFinancialSummary from "./tools/rentals-financial-summary";
import crmFunnel from "./tools/crm-funnel";
import marketingPerformance from "./tools/marketing-performance";
import businessInsights from "./tools/business-insights";
import { createMcpAppContext, type McpAppContext } from "./external-tools";

import prepareAgendaEvent from "./tools/prepare-agenda-event";
import prepareAttendanceNote from "./tools/prepare-attendance-note";
import prepareAttendanceStageChange from "./tools/prepare-attendance-stage-change";
import prepareSharedSelection from "./tools/prepare-shared-selection";
import prepareMessageDraft from "./tools/prepare-message-draft";
import getActionStatus from "./tools/get-action-status";

// Vite inlines the stable ref; the published SUPABASE_URL may be a proxy.
const projectRef = import.meta.env?.["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp<McpAppContext>({
  name: "gestao-cordial",
  title: "Gestão Cordial",
  version: "0.3.0",
  instructions:
    "Consulte o Gestão Cordial dentro das permissões atuais do usuário. Aplicativos OAuth aprovados podem preparar propostas imobiliárias pendentes por 15 minutos. Toda alteração exige que a pessoa abra o link do Gestão e clique em Confirmar com sua sessão pessoal. Nunca confirme, execute, edite ou cancele por MCP; não envie mensagens a clientes. Reutilize requestId somente ao repetir a mesma solicitação.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  createAppContext: createMcpAppContext,
  tools: [
    businessInsights,
    portfolioSummary,
    rentalsFinancialSummary,
    crmFunnel,
    marketingPerformance,
    searchProperties,
    searchClients,
    listAttendances,
    prepareAgendaEvent,
    prepareAttendanceNote,
    prepareAttendanceStageChange,
    prepareSharedSelection,
    prepareMessageDraft,
    getActionStatus,
  ],
});
