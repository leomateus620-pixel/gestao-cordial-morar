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
