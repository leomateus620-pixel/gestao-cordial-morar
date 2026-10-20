import type {
  InspectionKind,
  InspectionStatus,
  ItemState,
  Meters,
  OrganizedObservation,
} from "./model";
import type { PropertyForInspection } from "./vistoria.functions";
export type PropertySnapshot = {
  cadastro?: Partial<PropertyForInspection>;
  confirmado?: Partial<PropertyForInspection>;
  endereco?: string;
  search_text?: string;
  captured_at?: string;
};
export type InspectionRow = {
  id: string;
  numero: number;
  revision: number;
  property_id: string;
  agency: "cordial" | "morar";
  kind: InspectionKind;
  status: InspectionStatus;
  responsible_id: string;
  responsible_name: string | null;
  created_by: string;
  inspected_at: string | null;
  created_at: string;
  updated_at: string;
  current_version: number;
  property_snapshot: PropertySnapshot;
  plan_confirmed: boolean;
  furnished: "nao_informado" | "nao" | "semimobiliado" | "mobiliado";
  cleaning: "nao_informado" | "limpo" | "parcial" | "sujo" | "nao_se_aplica";
  meters: Meters;
  participants: Array<{ nome: string; papel: string }>;
  keys: Array<{ descricao: string; quantidade: number }>;
  general_notes: string | null;
  conclusion: string | null;
};
export type RoomRow = {
  id: string;
  inspection_id: string;
  name: string;
  kind: string;
  position: number;
  revision: number;
  no_photo_reason: string | null;
};
export type ItemRow = {
  id: string;
  inspection_id: string;
  room_id: string;
  name: string;
  category: string;
  position: number;
  revision: number;
  state: ItemState;
  quantity: number | null;
  material: string | null;
  color: string | null;
  notes: string | null;
  damage: string | null;
  untested_reason: string | null;
};
export type MediaRow = {
  id: string;
  inspection_id: string;
  room_id: string;
  item_id: string | null;
  storage_path: string;
  caption: string | null;
  position: number;
  revision: number;
  status: "pendente" | "confirmada";
  taken_at: string | null;
  time_source: "captura" | "importacao";
  created_at: string;
};
export type NoteRow = {
  id: string;
  inspection_id: string;
  room_id: string;
  item_id: string | null;
  client_key: string;
  source: "voz" | "texto";
  audio_path: string | null;
  audio_seconds: number | null;
  transcript_original: string | null;
  approved_text: string | null;
  suggestion: { observacoes: OrganizedObservation[] } | null;
  status: "pendente_transcricao" | "transcrito" | "revisado" | "descartado";
  revision: number;
  created_at: string;
};
export type InspectionData = {
  inspection: InspectionRow;
  rooms: RoomRow[];
  items: ItemRow[];
  media: MediaRow[];
  notes: NoteRow[];
  documents: Array<{
    id: string;
    version: number;
    byte_size: number;
    created_at: string;
    created_by: string;
  }>;
  events: Array<{
    id: string;
    event: string;
    details: Record<string, string | number | boolean | null>;
    created_at: string;
    actor_id: string;
  }>;
  serverTime: string;
  cacheMode?: boolean;
};
