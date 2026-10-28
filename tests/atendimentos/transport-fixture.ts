import type {
  Atendimento,
  AtendimentoCreateInput,
  AtendimentoUpdatePatch,
  PipelineStage,
} from "../../src/types/atendimento";
import type { AttendanceHistoryEvent } from "../../src/lib/attendances/attendances.functions";

const params = new URLSearchParams(location.search);
const brokerId = "20000000-0000-4000-8000-000000000001";
const secondBrokerId = "20000000-0000-4000-8000-000000000002";
const countParam = Number(params.get("count") ?? 40);
const firstCount = Number.isFinite(countParam) ? Math.max(0, Math.min(5000, countParam)) : 40;
const names = [
  "Mariana Almeida",
  "Pedro Henrique",
  "Ana Carolina Ferreira",
  "Lucas Oliveira",
  "Beatriz Santos",
  "Rafael Costa",
  "Juliana Martins",
  "Gustavo Lima",
  "Camila Ribeiro",
  "Felipe Rodrigues",
  "Isabela Souza",
  "Bruno Carvalho",
  "Fernanda Gomes",
  "Thiago Rocha",
  "Larissa Melo",
  "Diego Barbosa",
];
const stages: Array<[PipelineStage, number]> = [
  ["primeiro_contato", firstCount],
  ["apresentando_solucao", 15],
  ["visita", 3],
  ["proposta", 1],
  ["fechamento", 2],
  ["perdido", 2],
  ["em_espera", 2],
];
let serial = 0;
let rows: Atendimento[] =
  params.get("scenario") === "empty"
    ? []
    : stages.flatMap(([stage, count]) =>
        Array.from({ length: count }, (_, index): Atendimento => {
          serial += 1;
          const id = `10000000-0000-4000-8000-${String(serial).padStart(12, "0")}`;
          const followUp =
            index % 5 === 0
              ? undefined
              : new Date(Date.now() + ((index % 5) - 2) * 86_400_000).toISOString();
          return {
            id,
            clienteId: index < 6 ? "30000000-0000-4000-8000-000000000001" : undefined,
            clienteNome:
              index === 14
                ? "Maria Eduarda de Albuquerque e Vasconcelos Pereira da Silva"
                : index === 24
                  ? "NomeExtensoSemEspaçosParaVerificarQuebraDeLinhaCorretaNoCardCompacto"
                  : `${names[index % names.length]}${index >= names.length ? ` ${Math.floor(index / names.length) + 1}` : ""}`,
            telefone: index % 7 === 0 ? "" : `1199000${String(serial).padStart(4, "0")}`,
            email: `contato${serial}@example.test`,
            contatoPreferencial: "whatsapp",
            origem: "site",
            fonteProspeccao: "lead_imobiliaria",
            imobiliaria: index % 3 === 0 ? "morar" : "cordial",
            corretorId: index % 6 === 0 ? undefined : index % 2 === 0 ? brokerId : secondBrokerId,
            corretorNome:
              index % 6 === 0 ? undefined : index % 2 === 0 ? "Ana Ribeiro" : "Carlos Mendes",
            finalidade: "compra",
            tipoImovel: index % 3 === 0 ? "casa" : "apartamento",
            bairroInteresse: index % 2 === 0 ? "Centro" : "Jardim América",
            prioridade: "media",
            status:
              stage === "perdido"
                ? "perdido"
                : stage === "fechamento"
                  ? "fechado"
                  : "em_atendimento",
            pipelineStage: stage,
            proximoRetorno: followUp,
            proximoPasso: "enviar_opcoes",
            ultimaAcao:
              index % 4 === 0
                ? undefined
                : {
                    tipo: "note",
                    descricao:
                      index % 3 === 0
                        ? "Cliente recebeu as opções e pediu uma nova seleção de imóveis com varanda e duas vagas."
                        : "Conversa sobre preferências e próximos imóveis para apresentar.",
                    ator: "Pessoa de teste",
                    em: "2026-10-28T12:00:00Z",
                  },
            motivoPerda: stage === "perdido" ? "Cliente adiou a compra." : undefined,
            observacoes: "Contato fictício exclusivo da prévia de desenvolvimento.",
            historicoInicial: "Interesse informado pelo contato na primeira conversa.",
            historico: [],
            criadoPorId: brokerId,
            criadoEm: new Date(Date.UTC(2026, 9, 1 + (index % 27), 12)).toISOString(),
            atualizadoEm: new Date(Date.UTC(2026, 9, 28, 12, index % 60)).toISOString(),
          };
        }),
      );
// Keep the requested 40/15 sale counts exact. Rental records form a separate
// authorized fixture subset, as the canonical domain excludes legacy `ambos`.
rows = rows.concat(
  rows.slice(0, 5).map((item, index) => ({
    ...item,
    id: `11000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    clienteNome: `Locação · ${names[index]}`,
    finalidade: "aluguel" as const,
    pipelineStage: "primeiro_contato" as const,
  })),
);

export const fixtureMetrics = { lists: 0, histories: 0, firstOpens: 0, mutations: 0 };
function changed() {
  window.dispatchEvent(new Event("attendance-fixture-change"));
}
function checkAccess() {
  if (params.get("role") === "meta_reviewer")
    throw new Error("Acesso a Atendimentos indisponível para este perfil.");
}
function visibleRows() {
  return params.get("role") === "corretor"
    ? rows.filter((item) => item.corretorId === brokerId)
    : rows;
}
let failList = params.get("state") === "error";
export function failNextList() {
  failList = true;
}
export async function listAttendances() {
  fixtureMetrics.lists += 1;
  changed();
  checkAccess();
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      params.get("state") === "loading" && fixtureMetrics.lists === 1 ? 4500 : 180,
    ),
  );
  if (failList) {
    failList = false;
    throw new Error("Falha sintética de conexão. Tente novamente.");
  }
  return structuredClone(visibleRows());
}
export async function getAttendanceById({ data }: { data: { id: string } }) {
  checkAccess();
  const atendimento = visibleRows().find((item) => item.id === data.id);
  return atendimento
    ? { status: "ok", atendimento: structuredClone(atendimento) }
    : { status: "not_found" };
}
export async function listAttendanceBrokers() {
  return [
    { id: brokerId, nome: "Ana Ribeiro", imobiliarias: ["cordial", "morar"] },
    { id: secondBrokerId, nome: "Carlos Mendes", imobiliarias: ["cordial", "morar"] },
  ];
}
const extraHistory = new Map<string, AttendanceHistoryEvent[]>();
export async function listAttendanceHistory({ data }: { data: { attendanceId: string } }) {
  fixtureMetrics.histories += 1;
  changed();
  checkAccess();
  const initial: AttendanceHistoryEvent = {
    id: `${data.attendanceId}-history`,
    attendanceId: data.attendanceId,
    clientId: null,
    eventType: "created",
    actorId: brokerId,
    actorName: "Pessoa de teste",
    description:
      "Atendimento fictício criado para validar a ficha. Este evento pertence ao histórico individual.",
    previousValue: null,
    newValue: null,
    metadata: {},
    source: "preview",
    createdAt: "2026-10-01T12:00:00Z",
  };
  return [...(extraHistory.get(data.attendanceId) ?? []), initial];
}
export async function markAttendanceFirstOpened() {
  fixtureMetrics.firstOpens += 1;
  changed();
  return { ok: true, noop: true };
}
export async function updateAttendance({
  data,
}: {
  data: { id: string; patch: AtendimentoUpdatePatch };
}) {
  checkAccess();
  await new Promise((resolve) => setTimeout(resolve, 450));
  if (params.get("state") === "mutation-error")
    throw new Error("Falha sintética: alteração não salva.");
  const row = rows.find((item) => item.id === data.id);
  if (!row) throw new Error("Atendimento não encontrado.");
  Object.assign(row, data.patch, { atualizadoEm: new Date().toISOString() });
  fixtureMetrics.mutations += 1;
  changed();
  return structuredClone(row);
}
export async function transitionAttendanceStage({
  data,
}: {
  data: { id: string; to: PipelineStage };
}) {
  return updateAttendance({ data: { id: data.id, patch: { pipelineStage: data.to } } });
}
export async function addAttendanceNote({
  data,
}: {
  data: { attendanceId: string; texto: string };
}) {
  checkAccess();
  extraHistory.set(data.attendanceId, [
    {
      id: crypto.randomUUID(),
      attendanceId: data.attendanceId,
      clientId: null,
      eventType: "note",
      actorId: brokerId,
      actorName: "Pessoa de teste",
      description: data.texto,
      previousValue: null,
      newValue: null,
      metadata: {},
      source: "preview",
      createdAt: new Date().toISOString(),
    },
    ...(extraHistory.get(data.attendanceId) ?? []),
  ]);
  fixtureMetrics.mutations += 1;
  changed();
  return { ok: true };
}
export async function createAttendance({ data }: { data: AtendimentoCreateInput }) {
  const row: Atendimento = {
    ...data,
    id: crypto.randomUUID(),
    historico: [],
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  };
  rows = [row, ...rows];
  fixtureMetrics.mutations += 1;
  changed();
  return structuredClone(row);
}
export async function deleteAttendance({ data }: { data: { id: string } }) {
  rows = rows.filter((item) => item.id !== data.id);
  return true;
}
export async function findClientByContact() {
  return [];
}
export async function findExistingAttendanceByContact() {
  return [];
}
export async function createClient() {
  return { id: crypto.randomUUID() };
}
export async function listClients() {
  return [];
}
export async function updateClient() {
  return {};
}
export async function deleteClient() {
  return true;
}
export async function sendFirstAttendanceEmail() {
  return { status: "skipped", reason: "no_email" };
}
export async function upsertAgendaEvent({ data }: { data: unknown }) {
  return data;
}
export async function listAgendaEvents() {
  return [];
}
export async function softDeleteAgendaEvent() {
  return true;
}
export async function completeAgendaEvent() {
  return true;
}
export async function convertAttendanceToSale() {
  throw new Error("Conversão financeira não habilitada na prévia isolada.");
}
export async function listBrokerAttendanceHistoryReport() {
  return [];
}
export async function listAttendanceReportContacts() {
  return [];
}
export async function listClientAttendanceHistoryReport() {
  return [];
}
