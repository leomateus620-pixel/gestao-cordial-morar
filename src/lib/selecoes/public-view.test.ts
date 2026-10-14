import { test } from "node:test";
import assert from "node:assert/strict";
import { photoPathsOf, toPublicSelection } from "./public-view";

const raw = {
  state: "ok",
  agency: "cordial",
  title: "Casas",
  message: "Oi",
  broker: "Ana",
  whatsapp: "5555999990000",
  internal_client_name: "Cliente Secreto",
  items: [
    {
      available: true,
      key: 1,
      id: "7a41060e-9170-44e1-b5b4-03dac8bdf9f8",
      reference: "1403",
      type: "Casa",
      operation: "venda",
      price: 380000,
      location: "Bairro Cruzeiro · Santa Rosa / RS",
      endereco: "Rua das Flores",
      numero: "355",
      proprietario_nome: "Fulano",
      proprietario_telefone: "55999",
      observacoes_internas: "nota",
      comissao: 6,
      codigo: "INT-99",
      photos: ["p/a.jpg"],
    },
    { available: true, key: 2, reference: null, type: "Apto", price: null, location: null, photos: [] },
    { available: false, key: 3, reference: "x", price: 1 },
  ],
};

test("retorno público só tem campos autorizados", () => {
  const out = toPublicSelection(raw, new Map([["p/a.jpg", "https://signed/a"]]));
  const json = JSON.stringify(out);
  for (const banned of ["Rua das Flores", "355", "Fulano", "55999\"", "nota", "comissao", "INT-99", "Cliente Secreto", "7a41060e"]) {
    assert.ok(!json.includes(banned), `vazou: ${banned}`);
  }
  assert.equal(out.state, "ok");
  if (out.state !== "ok") return;
  const [a, b, c] = out.items;
  assert.ok(a?.available && a.photos[0] === "https://signed/a" && a.reference === "1403");
  assert.ok(b?.available && b.price === null && b.location === null && b.reference === null);
  assert.deepEqual(c, { available: false, key: 3 });
  assert.deepEqual(photoPathsOf(raw), ["p/a.jpg"]);
});

test("links encerrados/expirados/inválidos não trazem dados", () => {
  assert.deepEqual(toPublicSelection({ state: "closed", agency: "morar", title: "x" }, new Map()), {
    state: "closed",
    agency: "morar",
  });
  assert.deepEqual(toPublicSelection(null, new Map()), { state: "invalid" });
  assert.deepEqual(toPublicSelection({ state: "weird" }, new Map()), { state: "invalid" });
});
