import { STATUS_LABEL, type InspectionStatus, type Meters, emptyMeters } from "./model";
import type { InspectionFull } from "./vistoria.functions";
import type { PdfModel } from "./pdf";

const FURNISHED: Record<string, string> = { nao_informado: "Não informado", nao: "Não", semimobiliado: "Semimobiliado", mobiliado: "Mobiliado" };
const CLEANING: Record<string, string> = { nao_informado: "Não informado", limpo: "Limpo", parcial: "Parcialmente limpo", sujo: "Sujo", nao_se_aplica: "Não se aplica" };

/** Monta o modelo do laudo a partir dos dados confirmados pelo servidor. */
export function toPdfModel(full: InspectionFull, opts: { draft: boolean; version: number | null }): PdfModel {
  const i = full.inspection;
  const cad = i.property_snapshot?.cadastro ?? {};
  const conf = i.property_snapshot?.confirmado ?? {};
  const codes =
    [cad.codigo_cordial && `Cordial ${cad.codigo_cordial}`, cad.codigo_morar && `Morar ${cad.codigo_morar}`].filter(Boolean).join(" · ") ||
    (cad.codigo ? `Código ${cad.codigo}` : "Sem código");
  return {
    brand: i.agency === "morar" ? "morar" : "cordial",
    numero: i.numero,
    kind: i.kind,
    statusLabel: opts.draft ? STATUS_LABEL[i.status as InspectionStatus] : "Concluída",
    version: opts.version,
    draft: opts.draft,
    generatedAt: new Date().toISOString(),
    property: { codes, tipo: conf.tipo || cad.tipo || "Não informado", endereco: i.property_snapshot?.endereco || "Não informado" },
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
        .map((n) =>
          n.status === "revisado" && n.approved_text
            ? { text: n.approved_text, kind: "aprovado" as const }
            : { text: n.transcript_original || "(áudio ainda não transcrito)", kind: "transcricao_nao_revisada" as const },
        ),
      photos: full.media
        .filter((m) => m.room_id === r.id && m.status === "confirmada")
        .map((m) => ({ path: m.storage_path, caption: m.caption, takenAt: m.taken_at, timeSource: m.time_source, itemId: m.item_id })),
    })),
  };
}
