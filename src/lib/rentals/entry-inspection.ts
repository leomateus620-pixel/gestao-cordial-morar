/**
 * Pure rules for the entry inspection (vistoria de entrada) of a rental contract.
 *
 * A contract unlocks the entry inspection once an attached rental-contract
 * document has been reviewed ("conferido"). That covers a contract generated
 * here as well as an older contract that was attached and checked by hand.
 * Only one entry inspection may exist per contract; the database enforces that
 * with a partial unique index on inspections (rental_contract_id) WHERE
 * rental_kind = 'entrada'.
 */

export const CONTRACT_DOCUMENT_CATEGORY = "contrato_aluguel";

export type EntryInspectionDocument = {
  id: string;
  category: string;
  reviewedAt: string | null;
};

export type EntryInspectionMissing = "no_contract_document" | "not_reviewed";

export type EntryInspectionGate = {
  unlocked: boolean;
  reviewedDocumentId: string | null;
  reviewedAt: string | null;
  missing: EntryInspectionMissing | null;
};

/** Only the rental-contract document may be reviewed for this purpose. */
export function canReviewContractDocument(category: string | null | undefined): boolean {
  return category === CONTRACT_DOCUMENT_CATEGORY;
}

/**
 * Unlocked when at least one contract document was reviewed. When several were,
 * the most recent review wins so the screen never shows a stale date.
 */
export function entryInspectionGate(
  documents: readonly EntryInspectionDocument[],
): EntryInspectionGate {
  const contractDocs = documents.filter((d) => d.category === CONTRACT_DOCUMENT_CATEGORY);
  const reviewed = contractDocs
    .filter((d) => typeof d.reviewedAt === "string" && d.reviewedAt.trim() !== "")
    .sort((a, b) => {
      const byDate = String(b.reviewedAt).localeCompare(String(a.reviewedAt));
      return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
    });
  const first = reviewed[0];
  if (first) {
    return {
      unlocked: true,
      reviewedDocumentId: first.id,
      reviewedAt: first.reviewedAt,
      missing: null,
    };
  }
  return {
    unlocked: false,
    reviewedDocumentId: null,
    reviewedAt: null,
    missing: contractDocs.length === 0 ? "no_contract_document" : "not_reviewed",
  };
}

export const ENTRY_INSPECTION_BLOCKED_REASON: Record<EntryInspectionMissing, string> = {
  no_contract_document:
    "Anexe o contrato de aluguel e marque como conferido para iniciar a vistoria de entrada.",
  not_reviewed:
    "Marque o contrato anexado como conferido para iniciar a vistoria de entrada.",
};

export type EntryInspectionAction =
  | { kind: "open"; inspectionId: string }
  | { kind: "start"; contractId: string }
  | { kind: "blocked"; reason: string };

/** An existing entry inspection always wins: the operator must not start a second one. */
export function entryInspectionAction(input: {
  contractId: string;
  gate: EntryInspectionGate;
  existingInspectionId: string | null;
}): EntryInspectionAction {
  if (input.existingInspectionId) {
    return { kind: "open", inspectionId: input.existingInspectionId };
  }
  if (input.gate.unlocked) return { kind: "start", contractId: input.contractId };
  return {
    kind: "blocked",
    reason: ENTRY_INSPECTION_BLOCKED_REASON[input.gate.missing ?? "not_reviewed"],
  };
}

// ============================ VISTORIA DE SAÍDA ============================

export type RentalInspectionKind = "entrada" | "saida";

export type ExitInspectionMissing = "no_entry" | "entry_not_finished" | "entry_no_document";

export const EXIT_INSPECTION_BLOCKED_REASON: Record<ExitInspectionMissing, string> = {
  no_entry: "A vistoria de saída é liberada depois que a vistoria de entrada for concluída.",
  entry_not_finished:
    "Conclua a vistoria de entrada (com o termo gerado) para liberar a vistoria de saída.",
  entry_no_document:
    "A vistoria de entrada ainda não tem o termo em PDF registrado. Gere o termo para liberar a saída.",
};

/**
 * Saída só libera com a entrada concluída E com o termo (PDF) registrado.
 * Rascunho, revisão, transcrição pendente ou PDF não gerado não liberam.
 */
export function exitInspectionGate(entry: {
  id: string | null;
  status: string | null;
  hasDocument: boolean;
}): { unlocked: boolean; missing: ExitInspectionMissing | null } {
  if (!entry.id) return { unlocked: false, missing: "no_entry" };
  if (entry.status !== "concluida") return { unlocked: false, missing: "entry_not_finished" };
  if (!entry.hasDocument) return { unlocked: false, missing: "entry_no_document" };
  return { unlocked: true, missing: null };
}

export function exitInspectionAction(input: {
  contractId: string;
  entry: { id: string | null; status: string | null; hasDocument: boolean };
  existingExitId: string | null;
}): EntryInspectionAction {
  if (input.existingExitId) return { kind: "open", inspectionId: input.existingExitId };
  const gate = exitInspectionGate(input.entry);
  if (gate.unlocked) return { kind: "start", contractId: input.contractId };
  return { kind: "blocked", reason: EXIT_INSPECTION_BLOCKED_REASON[gate.missing ?? "no_entry"] };
}
