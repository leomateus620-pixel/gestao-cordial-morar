import test from "node:test";
import assert from "node:assert/strict";
import { maskAgentOutput, maskCpf, maskEmail, maskPhone, maskText } from "./masking.ts";
test("masks contacts in structured fields and nested free text", () => {
  const out = maskAgentOutput({
    cpf: "12345678909",
    phone: "+55 (51) 99999-1234",
    email: "ana@example.com",
    nested: [{ text: "Ligar (51) 99999-1234; CPF 123.456.789-09; ana@example.com" }],
  });
  assert.equal(out.cpf, "***.***.***-09");
  assert.equal(out.phone, "(**) *****-1234");
  assert.equal(out.email, "a***@***.com");
  assert.doesNotMatch(JSON.stringify(out), /12345678909|99999-1234|ana@example.com|123\.456\.789/);
});
test("preserves UUIDs, record links, financial numbers and nulls", () => {
  const record = {
    id: "00000000-0000-4000-8000-000000000006",
    href: "/imoveis/00000000-0000-4000-8000-000000000006",
    valor: 200000.12,
    optional: null,
  };
  assert.deepEqual(maskAgentOutput(record), record);
});
test("contact masking is idempotent and handles missing data", () => {
  const text = "CPF 123.456.789-09 e (55) 99999-1234, ana@example.com";
  assert.equal(maskText(maskText(text)), maskText(text));
  assert.equal(maskCpf(null), "");
  assert.equal(maskPhone(undefined), "");
  assert.equal(maskEmail("invalid"), "[e-mail oculto]");
});
test("masks local phones without DDD", () => {
  for (const phone of ["99999-1234", "3333-1234", "99999 1234"]) {
    assert.ok(!maskText(`Ligar ${phone}.`).includes(phone));
  }
});
test("masks international e-mail domains and Unicode local parts", () => {
  for (const email of [
    "ana@imóveis.com.br",
    "joão.silva@imobiliária.com",
    "josé@exemplo.公司",
    "🏠ana@imóveis.com.br",
    "ana@xn--imveis-2va.com.br",
    "jose\u0301@imo\u0301veis.com.br",
  ]) {
    const masked = maskText(`Contato: ${email}; próximo passo.`);
    assert.ok(!masked.includes(email), email);
    assert.match(masked, /\*\*\*@\*\*\*/u);
    assert.ok(masked.endsWith("; próximo passo."));
    assert.equal(maskText(masked), masked, `idempotent: ${email}`);
  }
  assert.equal(maskText("Contato: ana@imóveis.com.br"), "Contato: a***@***.br");
  assert.equal(maskEmail("🏠ana@imóveis.com.br"), "🏠***@***.br");
});
test("Unicode e-mail masking preserves unrelated UUID links and surrounding text", () => {
  const href = "/imoveis/45f8f991-26a0-49db-b683-94c6be3f0123";
  assert.equal(
    maskText(`Abrir ${href}. Contato joão@imóveis.com.br!`),
    `Abrir ${href}. Contato j***@***.br!`,
  );
});
