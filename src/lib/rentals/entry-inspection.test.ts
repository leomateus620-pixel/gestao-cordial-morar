import assert from "node:assert/strict";
import test from "node:test";
import {
  canReviewContractDocument,
  entryInspectionAction,
  entryInspectionGate,
  ENTRY_INSPECTION_BLOCKED_REASON,
} from "./entry-inspection";

const doc = (
  id: string,
  category: string,
  reviewedAt: string | null = null,
): { id: string; category: string; reviewedAt: string | null } => ({ id, category, reviewedAt });

test("contrato anexado e conferido libera a vistoria de entrada", () => {
  const gate = entryInspectionGate([doc("a", "contrato_aluguel", "2026-11-20T10:00:00Z")]);
  assert.equal(gate.unlocked, true);
  assert.equal(gate.reviewedDocumentId, "a");
  assert.equal(gate.missing, null);
});

test("contrato antigo anexado sem conferência ainda bloqueia", () => {
  const gate = entryInspectionGate([doc("a", "contrato_aluguel")]);
  assert.equal(gate.unlocked, false);
  assert.equal(gate.missing, "not_reviewed");
  assert.deepEqual(
    entryInspectionAction({ contractId: "c1", gate, existingInspectionId: null }),
    { kind: "blocked", reason: ENTRY_INSPECTION_BLOCKED_REASON.not_reviewed },
  );
});

test("sem contrato anexado aponta a anexação, não a conferência", () => {
  const gate = entryInspectionGate([doc("t", "termo_vistoria", "2026-11-20T10:00:00Z")]);
  assert.equal(gate.unlocked, false);
  assert.equal(gate.missing, "no_contract_document");
  assert.deepEqual(
    entryInspectionAction({ contractId: "c1", gate, existingInspectionId: null }),
    { kind: "blocked", reason: ENTRY_INSPECTION_BLOCKED_REASON.no_contract_document },
  );
});

test("conferência de outro tipo de documento não libera", () => {
  const gate = entryInspectionGate([
    doc("k", "checklist_aluguel", "2026-11-20T10:00:00Z"),
    doc("a", "contrato_aluguel"),
  ]);
  assert.equal(gate.unlocked, false);
  assert.equal(gate.missing, "not_reviewed");
});

test("a conferência mais recente é a exibida", () => {
  const gate = entryInspectionGate([
    doc("a", "contrato_aluguel", "2026-11-01T10:00:00Z"),
    doc("b", "contrato_aluguel", "2026-11-20T10:00:00Z"),
  ]);
  assert.equal(gate.reviewedDocumentId, "b");
  assert.equal(gate.reviewedAt, "2026-11-20T10:00:00Z");
});

test("vistoria de entrada já existente abre em vez de iniciar outra", () => {
  const gate = entryInspectionGate([doc("a", "contrato_aluguel", "2026-11-20T10:00:00Z")]);
  assert.deepEqual(
    entryInspectionAction({ contractId: "c1", gate, existingInspectionId: "i1" }),
    { kind: "open", inspectionId: "i1" },
  );
  // Mesmo sem conferência, uma vistoria já aberta não pode ser recriada.
  const locked = entryInspectionGate([]);
  assert.deepEqual(
    entryInspectionAction({ contractId: "c1", gate: locked, existingInspectionId: "i1" }),
    { kind: "open", inspectionId: "i1" },
  );
});

test("só o contrato de aluguel pode ser marcado como conferido", () => {
  assert.equal(canReviewContractDocument("contrato_aluguel"), true);
  assert.equal(canReviewContractDocument("termo_vistoria"), false);
  assert.equal(canReviewContractDocument("outro"), false);
  assert.equal(canReviewContractDocument(null), false);
});
