import { test } from "node:test";
import assert from "node:assert/strict";
import { checkActiveOrder, type GalleryRow } from "./active-order";

// Cenário do imóvel 1384: 17 ativas + 1 aguardando exclusão nos sites.
const active = Array.from({ length: 17 }, (_, i) => `a${i}`);
const rows: GalleryRow[] = [
  ...active.map((id) => ({ id, pendingRemoteDelete: false })),
  { id: "pend", pendingRemoteDelete: true },
];

test("aceita a ordem das 17 fotos ativas, ignorando a pendente", () => {
  const r = checkActiveOrder(rows, [...active].reverse());
  assert.deepEqual(r, { ok: true, coverId: "a16" });
});

test("recusa lista com a foto pendente de exclusão (não volta à galeria nem vira capa)", () => {
  assert.equal(checkActiveOrder(rows, ["pend", ...active.slice(1)]).ok, false);
  assert.deepEqual(checkActiveOrder(rows, ["pend", ...active]), { ok: false, reason: "fora_da_galeria" });
});

test("recusa lista que omite uma foto ativa", () => {
  assert.deepEqual(checkActiveOrder(rows, active.slice(1)), { ok: false, reason: "incompleta" });
});

test("recusa IDs repetidos e foto de outro imóvel", () => {
  assert.deepEqual(checkActiveOrder(rows, [...active.slice(0, 16), "a0"]), { ok: false, reason: "repetida" });
  assert.deepEqual(checkActiveOrder(rows, [...active.slice(0, 16), "outro"]), {
    ok: false,
    reason: "fora_da_galeria",
  });
});

test("substituir e reordenar antes da exclusão remota terminar", () => {
  // a2 foi substituída por "nova": a antiga fica pendente, a nova ocupa o lugar.
  const after: GalleryRow[] = [
    ...active.map((id) => ({ id, pendingRemoteDelete: id === "a2" })),
    { id: "nova", pendingRemoteDelete: false },
  ];
  const order = active.filter((id) => id !== "a2");
  order.splice(2, 0, "nova");
  [order[3], order[4]] = [order[4]!, order[3]!];
  assert.equal(checkActiveOrder(after, order).ok, true);
  // Lista antiga (carregada antes da troca) é recusada: a tela recarrega.
  assert.equal(checkActiveOrder(after, active).ok, false);
});
