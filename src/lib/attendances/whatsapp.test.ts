import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWhatsAppNumber, whatsappHref } from "./whatsapp.ts";

test("normalizes Brazilian national numbers and preserves country code", () => {
  assert.equal(normalizeWhatsAppNumber("(55) 98434-3050"), "5555984343050");
  assert.equal(normalizeWhatsAppNumber("+55 (51) 98888-7777"), "5551988887777");
  assert.equal(whatsappHref("51 98888-7777"), "https://wa.me/5551988887777");
});

test("rejects malformed and repeated-digit numbers", () => {
  assert.equal(normalizeWhatsAppNumber("123"), null);
  assert.equal(normalizeWhatsAppNumber("99999999999"), null);
  assert.equal(normalizeWhatsAppNumber(""), null);
  assert.equal(whatsappHref("telefone inválido"), null);
});
