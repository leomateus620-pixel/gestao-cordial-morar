// Local-only transport. No production connection or real property identifiers.
import type {
  InspectionData,
  InspectionRow,
  RoomRow,
  NoteRow,
  MediaRow,
} from "../../src/lib/vistoria/types";
import type { RoomKind } from "../../src/lib/vistoria/model";
import { emptyMeters, itemsForRoom } from "../../src/lib/vistoria/model";
const params =
  typeof location === "undefined" ? new URLSearchParams() : new URLSearchParams(location.search);
const termQa = params.has("termQa");
export const id = termQa
  ? "60000000-0000-4000-8000-000000000002"
  : "10000000-0000-4000-8000-000000000001";
async function termRequest(action: string, data: unknown = {}) {
  const response = await fetch("/__inspection_qa/" + action, {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
export const contractId = "60000000-0000-4000-8000-000000000001";
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
const isRental = ["rental", "room", "list"].includes(params.get("state") ?? "list");
const brand = params.get("brand") === "morar" ? "morar" : "cordial";
const inspection: InspectionRow = {
  id,
  numero: 42,
  revision: 1,
  kind: "entrada",
  status: "em_andamento",
  agency: brand,
  rental_contract_id: isRental ? contractId : undefined,
  rental_kind: isRental ? "entrada" : undefined,
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
  items: isRental
    ? []
    : rooms.flatMap((r, ri) =>
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
const persistenceKey = `fixture-vistoria-v2:${isRental ? "rental" : "standalone"}:${brand}`;
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
  if (termQa) full = await termRequest("snapshot");
  return structuredClone(full);
};
const rentalProperty = {
  ...property,
  id: "30000000-0000-4000-8000-000000000003",
  codigo_cordial: null,
  codigo_morar: null,
  brand,
};
export const getContractInspectionProperty = async () => rentalProperty;
export const getContractEntryInspectionState = async () => {
  if (termQa) await getInspection();
  return {
    contractId,
    rentalPropertyId: rentalProperty.id,
    brand,
    unlocked: true,
    reviewedAt: "2026-11-25T12:00:00Z",
    missing: null,
    existingInspectionId: full.inspection.rental_contract_id ? full.inspection.id : null,
    existingInspectionStatus: full.inspection.status,
    entryHasDocument: full.documents.length > 0,
    exitInspectionId: null,
    entryRooms: full.rooms,
  };
};
export const startRentalInspection = async ({ data }: { data: { kind: "entrada" | "saida" } }) => {
  full.inspection.rental_contract_id = contractId;
  full.inspection.rental_kind = data.kind;
  full.inspection.kind = data.kind;
  full.inspection.status = "em_andamento";
  if (data.kind === "saida") {
    full.documents = [];
    full.media = [];
    full.notes = [];
  }
  persist();
  return { id: full.inspection.id };
};
export const listInspections = async () => {
  if (termQa) await getInspection();
  return {
    rows: [
      full.inspection,
      {
        ...full.inspection,
        id: "10000000-0000-4000-8000-000000000009",
        numero: 87,
        agency: "morar",
        kind: "saida",
        status: "concluida",
        property_snapshot: {
          ...full.inspection.property_snapshot,
          endereco: "Rua dos Ipês, 185 · Centro · Cidade exemplo/RS",
        },
      },
    ],
    total: 2,
    pageSize: 20,
    byStatus: { rascunho: 0, em_andamento: 1, em_revisao: 0, concluida: 1 },
    continueInspection: {
      ...full.inspection,
      last_room: "Sala",
      pending_items: 20,
      pending_media: 0,
    },
    scopeTotal: 2,
  };
};
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
export const createInspection = async ({
  data,
}: {
  data: {
    id: string;
    agency: "cordial" | "morar";
    kind: InspectionRow["kind"];
    rooms: { name: string; kind: string }[];
  };
}) => {
  full = {
    ...full,
    inspection: {
      ...inspection,
      id: data.id,
      agency: data.agency,
      kind: data.kind,
      rental_contract_id: null,
      status: "em_andamento",
    },
    rooms: data.rooms.map((room, position) => ({
      ...room,
      id: crypto.randomUUID(),
      position,
      inspection_id: data.id,
      revision: 1,
      no_photo_reason: null,
    })),
    items: [],
    media: [],
    notes: [],
    documents: [],
  };
  persist();
  return { id: data.id };
};
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
  persist();
  return row;
};
export const addItem = async () => ({});
export const deleteRoom = async () => ({});
export const deleteItem = async () => ({});
export const deleteMedia = async () => ({});
export const reorderRooms = async () => ({});
export const reorderMedia = async () => ({});
export const registerMedia = async ({
  data,
}: {
  data: {
    roomId: string;
    itemId: string | null;
    clientKey: string;
    storagePath: string;
    takenAt: string;
    timeSource: MediaRow["time_source"];
  };
}): Promise<MediaRow> => {
  ensureOnline();
  const previous = full.media.find((photo) => photo.client_key === data.clientKey);
  if (previous) return previous;
  const row: MediaRow = {
    id: crypto.randomUUID(),
    client_key: data.clientKey,
    inspection_id: full.inspection.id,
    room_id: data.roomId,
    item_id: data.itemId,
    status: "confirmada",
    storage_path: data.storagePath,
    taken_at: data.takenAt,
    time_source: data.timeSource,
    position: full.media.length,
    caption: null,
    revision: 1,
    created_at: data.takenAt,
  };
  full.media.push(row);
  full.inspection.revision++;
  persist();
  return row;
};
export const transcribeNote = async () => ({});
export const deleteVoiceNote = async () => ({});
export const signInspectionFiles = async ({ data }: { data: { paths: string[] } }) =>
  termQa
    ? termRequest("sign-photos", data)
    : Object.fromEntries(
        data.paths.map((path) => [path, localStorage.getItem(`fixture-object:${path}`) ?? ""]),
      );
export const signInspectionDocument = async ({ data }: { data: { version: number } }) =>
  termQa ? termRequest("sign-document", data) : {};
export const finalizeInspection = async ({ data }: { data: unknown }) =>
  termQa ? termRequest("emit", data) : { version: 1 };
export const reopenInspection = async () => ({});
// Só o transporte de demonstração usa data URLs. O app usa blobs no IndexedDB.
export const supabase = {
  storage: {
    from: () => ({
      upload: async (path: string, blob: Blob) => {
        ensureOnline();
        const reader = new FileReader();
        const data = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        localStorage.setItem(`fixture-object:${path}`, data);
        return { error: null };
      },
    }),
  },
};
