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

export const fixtureAction = {
  id: "00000000-0000-4000-8000-000000000201",
  type: "agenda_event" as const,
  botId: "agenda",
  revision: 1,
  status: "pending" as const,
  expiresAt: "2099-10-16T18:15:00-03:00",
  title: "Criar visita",
  summary: "Cliente e imóvel de demonstração.",
  diff: [
    { label: "Visita", after: "Apartamento de demonstração · Centro" },
    { label: "Horário", after: "Sexta, 16/10 · 14h às 15h" },
    { label: "Responsável", after: "Corretor de demonstração" },
  ],
  payload: {
    title: "Visita de demonstração",
    start: "2026-10-16T14:00:00-03:00",
    end: "2026-10-16T15:00:00-03:00",
    agency: "cordial" as const,
    kind: "visita" as const,
  },
};
let fixtureCurrent: any = { ...fixtureAction };
const fixtureListeners = new Set<(action: typeof fixtureCurrent) => void>();
const notifyActions = () => fixtureListeners.forEach((listener) => listener(fixtureCurrent));
export function subscribeFixtureActions(listener: (action: typeof fixtureCurrent) => void) {
  fixtureListeners.add(listener);
  return () => {
    fixtureListeners.delete(listener);
  };
}
export function resetFixtureAction() {
  fixtureCurrent = { ...fixtureAction };
  notifyActions();
}
export async function listAssistantActions() {
  return [fixtureCurrent];
}
export async function confirmAssistantAction() {
  fixtureCurrent = {
    ...fixtureCurrent,
    status: "executed",
    result: {
      text: "Visita de demonstração criada.",
      href: "/agenda?id=00000000-0000-4000-8000-000000000101",
    },
  };
  notifyActions();
  return fixtureCurrent;
}
export async function editAssistantAction({ data }: any) {
  fixtureCurrent = {
    ...fixtureCurrent,
    payload: data.payload,
    revision: fixtureCurrent.revision + 1,
    diff: [
      { label: "Título", after: data.payload.title ?? data.payload.text ?? "Proposta revisada" },
      { label: "Horário", after: "Sexta, 16/10 · 14h às 15h" },
    ],
  };
  notifyActions();
  return fixtureCurrent;
}
export async function cancelAssistantAction() {
  fixtureCurrent = { ...fixtureCurrent, status: "cancelled" };
  notifyActions();
  return fixtureCurrent;
}
export async function listAssistantRoutines() {
  return { routines: [], readiness: await getAssistantReadiness() };
}
export async function prepareAssistantRoutine() {
  return {
    requestId: "00000000-0000-4000-8000-000000000301",
    proposal: {
      name: "Resumo da agenda",
      template: "agenda_today",
      hour: 8,
      minute: 0,
      timeZone: "America/Sao_Paulo",
      days: "every_day",
    },
    summary: "Resumo diário de demonstração",
  };
}
export async function saveAssistantRoutine() {
  return listAssistantRoutines();
}
export async function setAssistantRoutineState() {
  return listAssistantRoutines();
}
export async function deleteAssistantRoutine() {
  return listAssistantRoutines();
}
export async function getAssistantRoutineRun() {
  return { status: "completed", scheduledAt: "2026-10-16T08:00:00-03:00", items: [] };
}
export async function listAssistantMemory() {
  return {
    preferences: {
      tone: "curto",
      focusNeighborhoods: [],
      preferredStart: "08:00",
      preferredEnd: "18:00",
    },
    updatedAt: null,
  };
}
export async function saveAssistantMemory({ data }: any) {
  return { preferences: data.preferences, updatedAt: "2026-10-16T18:00:00-03:00" };
}
export async function deleteAssistantMemory() {
  return listAssistantMemory();
}
export async function getAssistantReadiness() {
  return { status: "ready", delegation: "connected", schedulerEnabled: true, missing: [] };
}
export async function beginAssistantDelegation() {
  throw new Error("Autorização indisponível na demonstração local.");
}
export async function revokeAssistantDelegation() {
  return { revoked: true };
}
