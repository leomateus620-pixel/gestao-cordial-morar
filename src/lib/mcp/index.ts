import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchProperties from "./tools/search-properties";
import searchClients from "./tools/search-clients";
import listAttendances from "./tools/list-attendances";

// Vite inlines the stable ref; the published SUPABASE_URL may be a proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "gestao-cordial",
  title: "Gestão Cordial",
  version: "0.1.0",
  instructions:
    "Ferramentas somente leitura do Gestão Cordial: buscar imóveis da carteira, clientes e atendimentos visíveis ao usuário conectado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchProperties, searchClients, listAttendances],
});
