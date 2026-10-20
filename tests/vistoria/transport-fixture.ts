// Local-only transport. No production connection or real property identifiers.
import type { InspectionData, InspectionRow, RoomRow, NoteRow } from "../../src/lib/vistoria/types";
import type { RoomKind } from "../../src/lib/vistoria/model";
import { emptyMeters, itemsForRoom } from "../../src/lib/vistoria/model";
const id = "10000000-0000-4000-8000-000000000001";
export const property = {
  id: "30000000-0000-4000-8000-000000000001",
  tipo: "Apartamento",
  codigo_cordial: "DEMO-42",
  codigo_morar: "DEMO-84",
  logradouro: "Rua de demonstração",
  numero: "120",
  complemento: "Apartamento 302",
  bairro: "Centro",
  cidade: "Cidade exemplo",
  uf: "RS",
  carteira: "cordial",
  dormitorios: 1,
  suites: 0,
  banheiros: 1,
  vagas: 1,
  salas: 1,
};
const inspection: InspectionRow = {
  id,
  numero: 42,
  revision: 1,
  kind: "entrada",
  status: "em_andamento",
  agency: "cordial",
  responsible_id: "20000000-0000-4000-8000-000000000001",
  responsible_name: "Corretora de demonstração",
  created_by: "20000000-0000-4000-8000-000000000001",
  property_id: property.id,
  property_snapshot: {
    cadastro: property,
    confirmado: property,
    endereco: "Rua de demonstração, 120 · Apto. 302 · Centro",
    search_text: "demo-42 demo-84 rua de demonstração",
  },
  created_at: "2026-10-20T10:00:00Z",
  updated_at: "2026-10-20T11:45:00Z",
  inspected_at: "2026-10-20T11:00:00Z",
  plan_confirmed: true,
  furnished: "nao",
  cleaning: "limpo",
  participants: [],
  keys: [],
  meters: emptyMeters(),
  current_version: 0,
  general_notes: null,
  conclusion: null,
};
const rooms: RoomRow[] = ["Sala", "Cozinha"].map((name, i) => ({
  id: `40000000-0000-4000-8000-00000000000${i + 1}`,
  inspection_id: id,
  name,
  kind: i ? "cozinha" : "sala",
  position: i,
  revision: 1,
  no_photo_reason: null,
}));
let full: InspectionData = {
  inspection,
  rooms,
  items: rooms.flatMap((r, ri) =>
    itemsForRoom(r.kind as "sala", false).map((it, i) => ({
      ...it,
      id: `50000000-0000-4000-8000-${String(ri * 100 + i).padStart(12, "0")}`,
      inspection_id: id,
      room_id: r.id,
      state: i === 0 ? "bom" : "pendente",
      revision: 1,
      position: i,
      material: i === 0 ? "Cerâmica" : null,
      color: i === 0 ? "Bege" : null,
      quantity: null,
      notes: null,
      damage: null,
      untested_reason: null,
    })),
  ),
  media: [],
  notes: [],
  documents: [],
  events: [],
  serverTime: "2026-10-20T11:45:00Z",
};
const persistenceKey = "fixture-server-v1";
try {
  const persisted = location.pathname.includes("baseline")
    ? null
    : localStorage.getItem(persistenceKey);
  if (persisted) full = JSON.parse(persisted);
} catch {
  /* Node fixtures have no browser storage */
}
function persist() {
  localStorage.setItem(persistenceKey, JSON.stringify(full));
}
function ensureOnline() {
  if (new URLSearchParams(location.search).has("offline")) throw new TypeError("Failed to fetch");
}
export const getInspection = async () => {
  ensureOnline();
  return structuredClone(full);
};
export const listInspections = async () => ({
  rows: [full.inspection],
  total: 1,
  pageSize: 20,
  byStatus: { rascunho: 0, em_andamento: 1, em_revisao: 0, concluida: 0 },
  continueInspection: {
    ...full.inspection,
    last_room: "Sala",
    pending_items: 20,
    pending_media: 0,
  },
  scopeTotal: 1,
});
export const searchInspectionProperties = async () => [
  property,
  {
    ...property,
    id: "30000000-0000-4000-8000-000000000002",
    tipo: "Casa",
    complemento: "Fundos",
    numero: "122",
  },
];
export const listInspectionResponsibles = async () => ({ canChoose: false, options: [] });
export const getVoiceStatus = async () => ({
  transcribe: { ready: false, missing: [] },
  live: { ready: false, missing: [] },
});
const update =
  (table: "inspection" | "items" | "rooms" | "notes" | "media") =>
  async ({
    data,
  }: {
    data: { id: string; expectedRevision: number; patch: Record<string, unknown> };
  }) => {
    ensureOnline();
    const row =
      table === "inspection" ? full.inspection : full[table].find((r) => r.id === data.id);
    if (!row) throw new Error("Destino removido");
    if (row.revision !== data.expectedRevision) throw new Error("CONFLITO: alterado em outra tela");
    Object.assign(row, data.patch, { revision: row.revision + 1 });
    if (table !== "inspection") full.inspection.revision++;
    persist();
    return structuredClone(row);
  };
export const updateItem = update("items"),
  updateRoom = update("rooms"),
  updateNote = update("notes"),
  updateMedia = update("media"),
  updateInspectionBasics = update("inspection");
export const createNote = async ({
  data,
}: {
  data: {
    roomId: string;
    itemId: string | null;
    clientKey: string;
    source: "voz" | "texto";
    audioPath: string | null;
    audioSeconds: number | null;
    text?: string | null;
  };
}) => {
  let n: NoteRow | undefined = full.notes.find((n) => n.client_key === data.clientKey);
  if (n) return n;
  n = {
    id: crypto.randomUUID(),
    inspection_id: id,
    room_id: data.roomId,
    item_id: data.itemId,
    client_key: data.clientKey,
    source: data.source,
    audio_path: data.audioPath,
    audio_seconds: data.audioSeconds,
    transcript_original: data.text ?? null,
    approved_text: null,
    suggestion: null,
    status: data.source === "voz" ? "pendente_transcricao" : "transcrito",
    revision: 1,
    created_at: new Date().toISOString(),
  };
  full.notes.push(n);
  full.inspection.revision++;
  persist();
  return structuredClone(n);
};
export const createInspection = async ({ data }: { data: { id: string } }) => ({ id: data.id });
export const addRoom = async ({ data }: { data: { name: string; kind: RoomKind } }) => {
  const row = {
    id: crypto.randomUUID(),
    inspection_id: id,
    name: data.name,
    kind: data.kind,
    position: full.rooms.length,
    no_photo_reason: null,
    revision: 1,
  };
  full.rooms.push(row);
  return row;
};
export const addItem = async () => ({});
export const deleteRoom = async () => ({});
export const deleteItem = async () => ({});
export const deleteMedia = async () => ({});
export const reorderRooms = async () => ({});
export const reorderMedia = async () => ({});
export const registerMedia = async () => ({});
export const transcribeNote = async () => ({});
export const signInspectionFiles = async () => ({});
export const signInspectionDocument = async () => ({});
export const finalizeInspection = async () => ({ version: 1 });
export const reopenInspection = async () => ({});
export const supabase = { storage: { from: () => ({ upload: async () => ({ error: null }) }) } };
