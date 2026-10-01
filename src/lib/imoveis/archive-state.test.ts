import assert from "node:assert/strict";
import test from "node:test";
import { archiveDestinations, pendingArchiveDestinations, retirementTargets } from "./archive-state.ts";

const l = (provider: string, status: string, intent = 4, archive: number | null = 4, desired = "hidden") => ({
  provider, status, desired_availability: desired, publication_intent_revision: intent, archive_intent_revision: archive,
});

test("enabled=false não conta como retirada: Cordial confirmado + Morar pendente fica pendente", () => {
  assert.deepEqual(pendingArchiveDestinations([l("cordial", "unpublished"), l("morar", "pending")]), ["morar"]);
  assert.deepEqual(pendingArchiveDestinations([l("cordial", "unpublished"), l("morar", "error")]), ["morar"]);
  assert.deepEqual(pendingArchiveDestinations([l("cordial", "unpublished"), l("morar", "unpublished")]), []);
});

test("confirmação de intenção antiga ou de publicação não vale", () => {
  assert.deepEqual(pendingArchiveDestinations([l("cordial", "unpublished", 3)]), ["cordial"]);
  assert.deepEqual(pendingArchiveDestinations([l("cordial", "unpublished", 5, 4, "visible")]), ["cordial"]);
  assert.deepEqual(pendingArchiveDestinations([l("cordial", "unpublished", 5)]), []);
});

test("destino fora do arquivamento é ignorado; estados para a tela", () => {
  assert.deepEqual(pendingArchiveDestinations([l("morar", "draft", 0, null)]), []);
  assert.deepEqual(
    archiveDestinations([l("morar", "error"), l("cordial", "unpublished")]).map((d) => d.state),
    ["retirado", "falhou"],
  );
});

test("alvos de retirada: nunca publicado fica de fora, criação ambígua entra", () => {
  const base = { enabled: false, external_property_id: null, last_synced_at: null, create_state: null };
  assert.deepEqual(retirementTargets([{ ...base, provider: "morar", status: "draft" }]), []);
  assert.deepEqual(retirementTargets([{ ...base, provider: "cordial", status: "error", create_state: "awaiting_create_reconcile" }]), ["cordial"]);
  assert.deepEqual(retirementTargets([{ ...base, provider: "morar", status: "published", external_property_id: "9" }]), ["morar"]);
});
