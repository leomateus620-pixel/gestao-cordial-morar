/** Preview-only transport. This module is aliased only by the isolated Vite config. */
export async function chatAssistant() {
  throw new Error("Use os estados de revisão. Não há provedor conectado nesta demonstração.");
}
export async function listAssistantConversations() {
  return [];
}
export async function listAssistantMessages() {
  return [];
}
export async function getAssistantBriefing() {
  return { items: [], generatedAt: "2026-10-16T12:00:00-03:00" };
}
export async function getAssistantContext() {
  return { record: null };
}
export async function searchAssistantRecords({ data }: { data: { kind: string; query: string } }) {
  if (!data.query.toLowerCase().includes("demo")) return [];
  return [
    {
      kind: data.kind,
      id: "00000000-0000-4000-8000-000000000101",
      label: data.kind === "client" ? "Cliente de demonstração" : "Imóvel de demonstração",
      detail: "Somente dados fictícios",
      href: "/atendimentos",
    },
  ];
}
