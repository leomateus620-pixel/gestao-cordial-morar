import { test } from "node:test";
import assert from "node:assert/strict";
import { displayPrice, displayLocation, priceDropBadge, newBadge } from "./display-rules.ts";

test("preço só aparece quando valor_modo = fixo", () => {
  assert.equal(displayPrice({ valor: 500000, valor_modo: "fixo", bairro: "X", cidade: "Y" }), "R$\u00a0500.000");
  assert.equal(displayPrice({ valor: 500000, valor_modo: "consulte", bairro: "X", cidade: "Y" }), null);
  assert.equal(displayPrice({ valor: null, valor_modo: "fixo", bairro: "X", cidade: "Y" }), null);
});

test("localização mostra só bairro/cidade", () => {
  assert.equal(displayLocation({ valor: null, valor_modo: "fixo", bairro: "Centro", cidade: "SP" }), "Centro · SP");
  assert.equal(displayLocation({ valor: null, valor_modo: "fixo", bairro: null, cidade: "SP" }), "SP");
});

test("selo baixou preço exige queda real com histórico", () => {
  assert.equal(priceDropBadge(null), false);
  assert.equal(priceDropBadge([{ valor: 100, recorded_at: "2024-01-01" }]), false);
  assert.equal(
    priceDropBadge([
      { valor: 200, recorded_at: "2024-01-01" },
      { valor: 150, recorded_at: "2024-02-01" },
    ]),
    true,
  );
  assert.equal(
    priceDropBadge([
      { valor: 150, recorded_at: "2024-01-01" },
      { valor: 200, recorded_at: "2024-02-01" },
    ]),
    false,
  );
});

test("selo novo depende de janela de dias", () => {
  const now = new Date("2024-02-10T00:00:00Z").getTime();
  assert.equal(newBadge("2024-02-01T00:00:00Z", now, 14), true);
  assert.equal(newBadge("2024-01-01T00:00:00Z", now, 14), false);
  assert.equal(newBadge(null, now, 14), false);
});
