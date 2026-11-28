import { inspectionTerm, isRentalTerm, reviewedTermText } from "./term";
import {
  pathBelongsTo,
  emptyMeters,
  STATUS_LABEL,
  type InspectionStatus,
  type Meters,
} from "./model";
import type { PdfModel } from "./pdf";
import type { InspectionFull } from "./vistoria.functions";
import { inspectionPropertyCodes } from "./ui";

const FURNISHED: Record<string, string> = {
  nao_informado: "Não informado",
  nao: "Não",
  semimobiliado: "Semimobiliado",
  mobiliado: "Mobiliado",
};
const CLEANING: Record<string, string> = {
  nao_informado: "Não informado",
  limpo: "Limpo",
  parcial: "Parcialmente limpo",
  sujo: "Sujo",
  nao_se_aplica: "Não se aplica",
};

/** Monta o modelo do laudo a partir dos dados confirmados pelo servidor. */
export function toPdfModel(
  full: InspectionFull,
  opts: { draft: boolean; version: number | null; generatedAt?: string },
): PdfModel {
  const i = full.inspection;
  const cad = i.property_snapshot?.cadastro ?? {};
  const conf = i.property_snapshot?.confirmado ?? {};
  const codes = inspectionPropertyCodes(cad) || "Sem código";
  const term = isRentalTerm(i.kind) ? inspectionTerm(full) : undefined;
  if (term && !term.brand) throw new Error(term.issues[0]);
  if (i.agency !== "cordial" && i.agency !== "morar")
    throw new Error("Confirme a imobiliária da vistoria.");
  const rooms = new Set(full.rooms.map((r) => r.id));
  const itemRooms = new Map(full.items.map((item) => [item.id, item.room_id]));
  const paths = new Set<string>();
  for (const row of [...full.items, ...full.notes, ...full.media]) {
    if (
      row.inspection_id !== i.id ||
      !rooms.has(row.room_id) ||
      ("item_id" in row && row.item_id && itemRooms.get(row.item_id) !== row.room_id)
    )
      throw new Error("Revise o vínculo entre a vistoria, o cômodo e o registro.");
  }
  if (full.rooms.some((r) => r.inspection_id !== i.id))
    throw new Error("Cômodo de outra vistoria.");
  for (const m of full.media) {
    if (!pathBelongsTo(m.storage_path, i.id, m.room_id) || paths.has(m.storage_path))
      throw new Error("Revise a foto e seu vínculo com o cômodo antes de gerar o documento.");
    paths.add(m.storage_path);
    if (!opts.draft && m.status !== "confirmada")
      throw new Error("Aguarde o envio de todas as fotos.");
  }
  return {
    term,
    brand: i.agency,
    numero: i.numero,
    kind: i.kind,
    statusLabel: opts.draft ? STATUS_LABEL[i.status as InspectionStatus] : "Concluída",
    version: opts.version,
    officialVersion: i.current_version,
    draft: opts.draft,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    property: {
      codes,
      tipo: conf.tipo || cad.tipo || "Não informado",
      endereco: term?.address || i.property_snapshot?.endereco || "",
    },
    responsible: i.responsible_name || "Responsável",
    inspectedAt: i.inspected_at,
    participants: i.participants ?? [],
    furnished: FURNISHED[i.furnished] ?? i.furnished,
    cleaning: CLEANING[i.cleaning] ?? i.cleaning,
    keys: i.keys ?? [],
    meters: { ...emptyMeters(), ...(i.meters as Partial<Meters>) },
    generalNotes: i.general_notes,
    conclusion: i.conclusion,
    rooms: full.rooms.map((r) => ({
      name: r.name,
      noPhotoReason: r.no_photo_reason,
      items: full.items.filter((it) => it.room_id === r.id),
      notes: full.notes
        .filter((n) => n.room_id === r.id && n.status !== "descartado")
        .flatMap((n) => {
          if (term) {
            const text = reviewedTermText(n);
            return text ? [{ text, kind: "aprovado" as const }] : [];
          }
          const approved = n.status === "revisado" && n.approved_text;
          return [
            {
              text: approved || n.transcript_original || "(áudio ainda não transcrito)",
              kind: approved ? ("aprovado" as const) : ("transcricao_nao_revisada" as const),
            },
          ];
        }),
      photos: full.media
        .filter((m) => m.room_id === r.id && m.status === "confirmada")
        .map((m) => ({
          path: m.storage_path,
          meter: m.meter,
          caption: m.caption,
          takenAt: m.taken_at,
          timeSource: m.time_source,
          itemId: m.item_id,
        })),
    })),
  };
}
