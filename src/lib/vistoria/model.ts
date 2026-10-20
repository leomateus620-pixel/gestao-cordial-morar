// Regras puras da Vistoria inteligente. Sem dependências de navegador ou servidor,
// para testes diretos com `tsx --test`.

export const INSPECTION_KINDS = ["entrada", "saida", "periodica", "constatacao"] as const;
export type InspectionKind = (typeof INSPECTION_KINDS)[number];
export const KIND_LABEL: Record<InspectionKind, string> = {
  entrada: "Entrada",
  saida: "Saída",
  periodica: "Periódica",
  constatacao: "Constatação",
};

export const INSPECTION_STATUSES = ["rascunho", "em_andamento", "em_revisao", "concluida"] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];
export const STATUS_LABEL: Record<InspectionStatus, string> = {
  rascunho: "Rascunho",
  em_andamento: "Em andamento",
  em_revisao: "Em revisão",
  concluida: "Concluída",
};

export const ITEM_STATES = ["pendente", "bom", "regular", "ruim", "nao_testado", "nao_se_aplica"] as const;
export type ItemState = (typeof ITEM_STATES)[number];
export const ITEM_STATE_LABEL: Record<ItemState, string> = {
  pendente: "Pendente",
  bom: "Bom",
  regular: "Regular",
  ruim: "Ruim",
  nao_testado: "Não testado",
  nao_se_aplica: "Não se aplica",
};

export type MeterStatus = "nao_informado" | "informado" | "nao_aplicavel" | "desligado";
export type MeterReading = { status: MeterStatus; reading?: string | null; number?: string | null };
export type Meters = { agua: MeterReading; luz: MeterReading; gas: MeterReading };
export const METER_LABEL: Record<keyof Meters, string> = { agua: "Água", luz: "Luz", gas: "Gás" };
export const METER_STATUS_LABEL: Record<MeterStatus, string> = {
  nao_informado: "Não informado",
  informado: "Leitura informada",
  nao_aplicavel: "Não aplicável",
  desligado: "Fornecimento desligado",
};
export function emptyMeters(): Meters {
  return {
    agua: { status: "nao_informado" },
    luz: { status: "nao_informado" },
    gas: { status: "nao_informado" },
  };
}
/** "Não informado" nunca vira zero: só exibe número quando a leitura foi de fato informada. */
export function meterText(m: MeterReading | undefined): string {
  if (!m || m.status === "nao_informado") return "Não informado";
  if (m.status === "informado") {
    const r = (m.reading ?? "").trim();
    return r ? r : "Leitura não preenchida";
  }
  return METER_STATUS_LABEL[m.status];
}

export type PropertyFamily = "casa" | "apartamento" | "comercial" | "terreno" | "outro";
export function propertyFamily(tipo: string | null | undefined): PropertyFamily {
  const t = (tipo ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!t.trim()) return "outro";
  if (/(terreno|lote|area de terra|gleba)/.test(t)) return "terreno";
  if (/(apart|kitnet|kitinete|flat|cobertura|studio|loft|duplex)/.test(t)) return "apartamento";
  if (/(sala|loja|comercial|galpao|pavilhao|predio|deposito|escritorio|ponto)/.test(t)) return "comercial";
  if (/(casa|sobrado|chacara|sitio|residencia|geminad)/.test(t)) return "casa";
  return "outro";
}

export type RoomKind =
  | "dormitorio"
  | "suite"
  | "banheiro"
  | "sala"
  | "cozinha"
  | "servico"
  | "garagem"
  | "externa"
  | "terreno"
  | "comercial"
  | "outro";

export type PlanItem = { name: string; category: "base" | "especifico" | "mobilia" };
export type PlanRoom = { name: string; kind: RoomKind; items: PlanItem[] };

const BASE = [
  "Piso",
  "Rodapé",
  "Paredes e pintura",
  "Teto",
  "Portas e fechaduras",
  "Janelas e vidros",
  "Tomadas e interruptores",
  "Iluminação",
];
const EXTRA: Partial<Record<RoomKind, string[]>> = {
  cozinha: ["Pia e bancada", "Torneiras", "Ralos", "Hidráulica e vazamentos", "Armários", "Revestimentos"],
  banheiro: [
    "Vaso sanitário",
    "Lavatório e louças",
    "Torneiras e registros",
    "Chuveiro",
    "Box",
    "Ralos",
    "Hidráulica e vazamentos",
    "Revestimentos",
    "Armário e espelho",
  ],
  servico: ["Tanque", "Torneiras", "Ralos", "Hidráulica e vazamentos", "Revestimentos"],
};
const OWN: Partial<Record<RoomKind, string[]>> = {
  garagem: ["Piso", "Paredes e pintura", "Portão", "Iluminação"],
  externa: ["Piso e calçamento", "Muros e cercas", "Portão", "Iluminação externa", "Jardim"],
  terreno: ["Muros e cercas", "Portão", "Solo e limpeza", "Calçada"],
};

export function itemsForRoom(kind: RoomKind, furnished: boolean): PlanItem[] {
  const own = OWN[kind];
  const items: PlanItem[] = own
    ? own.map((name) => ({ name, category: "base" }))
    : [
        ...BASE.map((name) => ({ name, category: "base" as const })),
        ...(EXTRA[kind] ?? []).map((name) => ({ name, category: "especifico" as const })),
      ];
  if (furnished && ["dormitorio", "suite", "sala", "cozinha", "comercial"].includes(kind)) {
    items.push({ name: "Mobiliário (inventário)", category: "mobilia" });
  }
  return items;
}

export type PlanInput = {
  tipo: string | null | undefined;
  dormitorios: number | null | undefined;
  suites: number | null | undefined;
  banheiros: number | null | undefined;
  vagas: number | null | undefined;
  salas: number | null | undefined;
  furnished?: boolean;
};

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const numbered = (base: string, count: number, i: number) => (count > 1 ? `${base} ${i + 1}` : base);

/**
 * Convenção do cadastro (ImobiBrasil/Gestão): `dormitorios` já inclui as suítes
 * e `banheiros` já inclui os banheiros das suítes. Assim, 3 dormitórios com 1
 * suíte geram Suíte + 2 dormitórios (nunca 4 quartos), e 2 banheiros com 1 suíte
 * geram Banheiro da suíte + 1 banheiro social. A planta é só sugestão e precisa
 * ser confirmada pelo vistoriador.
 */
export function buildRoomPlan(input: PlanInput): PlanRoom[] {
  const family = propertyFamily(input.tipo);
  const furnished = Boolean(input.furnished);
  const room = (name: string, kind: RoomKind): PlanRoom => ({ name, kind, items: itemsForRoom(kind, furnished) });
  if (family === "terreno") return [room("Terreno", "terreno")];
  if (family === "outro") return [];

  const rooms: PlanRoom[] = [];
  if (family === "comercial") {
    const salas = Math.max(1, n(input.salas));
    for (let i = 0; i < salas; i++) rooms.push(room(numbered("Sala comercial", salas, i), "comercial"));
    const ban = n(input.banheiros);
    for (let i = 0; i < ban; i++) rooms.push(room(numbered("Banheiro", ban, i), "banheiro"));
    if (n(input.vagas)) rooms.push(room("Garagem / vagas", "garagem"));
    rooms.push(room("Fachada e acesso", "externa"));
    return rooms;
  }

  const rawDorms = n(input.dormitorios);
  const rawSuites = n(input.suites);
  const dorms = Math.max(rawDorms, rawSuites);
  const suites = Math.min(rawSuites, dorms);
  const simples = dorms - suites;
  const salas = Math.max(1, n(input.salas));
  for (let i = 0; i < salas; i++) rooms.push(room(numbered("Sala", salas, i), "sala"));
  rooms.push(room("Cozinha", "cozinha"));
  for (let i = 0; i < suites; i++) {
    rooms.push(room(numbered("Suíte", suites, i), "suite"));
    rooms.push(room(numbered("Banheiro da suíte", suites, i), "banheiro"));
  }
  for (let i = 0; i < simples; i++) rooms.push(room(numbered("Dormitório", simples, i), "dormitorio"));
  const social = Math.max(0, n(input.banheiros) - suites);
  for (let i = 0; i < social; i++) rooms.push(room(numbered("Banheiro social", social, i), "banheiro"));
  rooms.push(room("Área de serviço", "servico"));
  if (n(input.vagas)) rooms.push(room(family === "apartamento" ? "Vaga de garagem" : "Garagem", "garagem"));
  if (family === "casa") rooms.push(room("Área externa", "externa"));
  return rooms;
}

/* ------------------------ Resolução e revisão ------------------------ */

export type ItemLike = {
  id: string;
  room_id: string;
  name: string;
  state: ItemState;
  damage?: string | null;
  untested_reason?: string | null;
};
export type RoomLike = { id: string; name: string; no_photo_reason?: string | null };
export type MediaLike = { id: string; room_id: string; status: "pendente" | "confirmada" };
export type NoteLike = { id: string; room_id: string; status: string };
export type LocalPendingLike = { room_id: string; kind: "photo" | "audio"; status: "local" | "enviando" | "erro" };

const blank = (s: string | null | undefined) => !s || !s.trim();

export function itemResolved(i: ItemLike): boolean {
  if (i.state === "pendente") return false;
  if (i.state === "nao_testado" && blank(i.untested_reason)) return false;
  if (i.state === "ruim" && blank(i.damage)) return false;
  return true;
}

export function progress(rooms: RoomLike[], items: ItemLike[]) {
  const total = items.length;
  const done = items.filter(itemResolved).length;
  const roomsDone = rooms.filter((r) => {
    const own = items.filter((i) => i.room_id === r.id);
    return own.length > 0 && own.every(itemResolved);
  }).length;
  return { total, done, rooms: rooms.length, roomsDone, percent: total ? Math.floor((done / total) * 100) : 0 };
}

export type ReviewIssue = {
  kind:
    | "dados_basicos"
    | "sem_ambientes"
    | "planta_nao_confirmada"
    | "item_pendente"
    | "nao_testado_sem_motivo"
    | "avaria_sem_descricao"
    | "ambiente_sem_foto"
    | "midia_pendente"
    | "relato_pendente"
    | "envio_local";
  message: string;
  roomId?: string;
  itemId?: string;
};

export type ReviewInput = {
  basics: { inspected_at: string | null; responsible_id: string | null; plan_confirmed: boolean };
  rooms: RoomLike[];
  items: ItemLike[];
  media: MediaLike[];
  notes: NoteLike[];
  localPending?: LocalPendingLike[];
};

export function reviewIssues(input: ReviewInput): ReviewIssue[] {
  const out: ReviewIssue[] = [];
  if (!input.basics.inspected_at) out.push({ kind: "dados_basicos", message: "Informe data e hora da vistoria." });
  if (!input.basics.responsible_id) out.push({ kind: "dados_basicos", message: "Informe o responsável." });
  if (!input.basics.plan_confirmed)
    out.push({ kind: "planta_nao_confirmada", message: "Confirme a planta (lista de ambientes)." });
  if (!input.rooms.length) out.push({ kind: "sem_ambientes", message: "Adicione ao menos um ambiente." });
  const roomName = new Map(input.rooms.map((r) => [r.id, r.name]));
  for (const i of input.items) {
    const where = `${roomName.get(i.room_id) ?? "Ambiente"} · ${i.name}`;
    if (i.state === "pendente") out.push({ kind: "item_pendente", message: `${where}: sem avaliação.`, roomId: i.room_id, itemId: i.id });
    else if (i.state === "nao_testado" && blank(i.untested_reason))
      out.push({ kind: "nao_testado_sem_motivo", message: `${where}: informe por que não foi testado.`, roomId: i.room_id, itemId: i.id });
    else if (i.state === "ruim" && blank(i.damage))
      out.push({ kind: "avaria_sem_descricao", message: `${where}: descreva a avaria.`, roomId: i.room_id, itemId: i.id });
  }
  for (const r of input.rooms) {
    const has = input.media.some((m) => m.room_id === r.id && m.status === "confirmada");
    if (!has && blank(r.no_photo_reason))
      out.push({ kind: "ambiente_sem_foto", message: `${r.name}: sem foto confirmada nem motivo registrado.`, roomId: r.id });
  }
  for (const m of input.media)
    if (m.status !== "confirmada")
      out.push({ kind: "midia_pendente", message: `${roomName.get(m.room_id) ?? "Ambiente"}: foto ainda não confirmada.`, roomId: m.room_id });
  for (const note of input.notes)
    if (note.status !== "revisado" && note.status !== "descartado")
      out.push({ kind: "relato_pendente", message: `${roomName.get(note.room_id) ?? "Ambiente"}: relato ainda não revisado.`, roomId: note.room_id });
  for (const p of input.localPending ?? [])
    out.push({
      kind: "envio_local",
      message: `${roomName.get(p.room_id) ?? "Ambiente"}: ${p.kind === "photo" ? "foto" : "áudio"} salvo só neste aparelho${p.status === "erro" ? " (falhou, tente de novo)" : ""}.`,
      roomId: p.room_id,
    });
  return out;
}

export const canFinalize = (input: ReviewInput) => reviewIssues(input).length === 0;

/* ------------------------ Voz: contexto travado ------------------------ */

export type VoiceContext = { inspectionId: string; roomId: string; sessionId: string };
export function sameVoiceContext(a: VoiceContext | null, b: VoiceContext | null): boolean {
  return Boolean(a && b && a.inspectionId === b.inspectionId && a.roomId === b.roomId && a.sessionId === b.sessionId);
}
/**
 * Uma resposta de transcrição/organização só preenche a tela se ainda estivermos
 * no mesmo cômodo e sessão de gravação. Caso contrário, ela fica salva no relato
 * do cômodo de origem para revisão, sem tocar o cômodo atual.
 */
export function shouldApplyVoiceResult(current: VoiceContext | null, origin: VoiceContext): boolean {
  return sameVoiceContext(current, origin);
}

export type OrganizedObservation = {
  elemento: string | null;
  material: string | null;
  cor: string | null;
  estado: string | null;
  avaria: string | null;
  local: string | null;
  teste: string | null;
};
export function observationText(o: OrganizedObservation): string {
  const parts: string[] = [];
  const add = (label: string, v: string | null) => {
    if (v && v.trim()) parts.push(`${label}: ${v.trim()}`);
  };
  add("Elemento", o.elemento);
  add("Material", o.material);
  add("Cor", o.cor);
  add("Estado relatado", o.estado);
  add("Avaria", o.avaria);
  add("Local", o.local);
  add("Teste", o.teste);
  return parts.join("; ");
}

/* ------------------------ Mídias e caminhos ------------------------ */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function mediaPath(inspectionId: string, roomId: string, clientKey: string, ext: "jpg" | "wav" | "webm" | "mp4") {
  if (!UUID.test(inspectionId) || !UUID.test(roomId)) throw new Error("Identificador inválido");
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(clientKey)) throw new Error("Chave local inválida");
  return `${inspectionId}/${roomId}/${clientKey}.${ext}`;
}
/** Garante que um caminho pertence à vistoria e ao cômodo informados. */
export function pathBelongsTo(path: string, inspectionId: string, roomId: string): boolean {
  return path.startsWith(`${inspectionId}/${roomId}/`) && !path.includes("..");
}
export function documentPath(inspectionId: string, version: number) {
  return `${inspectionId}/docs/v${version}.pdf`;
}

export function sniffImageMime(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP")
    return "image/webp";
  return null;
}
export function sniffAudio(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const head = String.fromCharCode(...bytes.slice(0, 4));
  if (head === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WAVE") return true;
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return true; // webm
  return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp"; // mp4/m4a
}

/* ------------------------ Permissões ------------------------ */

export type Perfil = "admin_owner" | "secretaria" | "corretor" | "financeiro_admin";
export function canUseInspections(perfil: Perfil | undefined) {
  return perfil === "admin_owner" || perfil === "secretaria" || perfil === "corretor";
}
export function canSeeAllInspections(perfil: Perfil | undefined) {
  return perfil === "admin_owner" || perfil === "secretaria";
}
/** Espelha a RLS: corretor só vê as que criou ou das quais é responsável. */
export function canOpenInspection(
  user: { id: string; perfil: Perfil } | null | undefined,
  insp: { responsible_id: string; created_by: string },
) {
  if (!user || !canUseInspections(user.perfil)) return false;
  if (canSeeAllInspections(user.perfil)) return true;
  return insp.responsible_id === user.id || insp.created_by === user.id;
}
export function resolveResponsible(perfil: Perfil, selfId: string, requested: string | null | undefined) {
  if (perfil === "corretor") return selfId;
  return requested || selfId;
}
