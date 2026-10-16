import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCaption } from "./caption-check.ts";

test("texto limpo passa", () => {
  const r = checkCaption("Apartamento aconchegante no bairro Centro, Fale com João.");
  assert.equal(r.ok, true);
  assert.deepEqual(r.issues, []);
});

test("reprova endereço exato", () => {
  const r = checkCaption("Fica na Rua das Flores 123, venha ver.");
  assert.equal(r.ok, false);
  assert.ok(r.issues.includes("endereco_exato"));
});

test("reprova cpf, telefone e e-mail", () => {
  assert.ok(checkCaption("CPF 123.456.789-00").issues.includes("cpf"));
  assert.ok(checkCaption("fale com (11) 98888-7777").issues.includes("telefone"));
  assert.ok(checkCaption("contato@imoveis.com").issues.includes("email"));
});

test("reprova promessa não verificável", () => {
  const r = checkCaption("Retorno garantido e valorização garantida!");
  assert.equal(r.ok, false);
  assert.ok(r.issues.includes("promessa_nao_verificavel"));
});
