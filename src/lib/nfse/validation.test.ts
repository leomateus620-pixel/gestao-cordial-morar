import assert from "node:assert/strict";
import test from "node:test";

import {
  isAllowedEndpoint,
  isSantaRosa,
  isValidCnpj,
  isValidCpf,
  isValidEmail,
  isValidTaxDoc,
  normalizePhone,
  normalizeTaxDoc,
  validateNfseSettings,
} from "./validation.ts";

test("CPF com dígito verificador", () => {
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("529.982.247-24"), false);
  assert.equal(isValidCpf("111.111.111-11"), false);
});

test("CNPJ numérico e alfanumérico com DV", () => {
  assert.equal(isValidCnpj("11.222.333/0001-81"), true);
  assert.equal(isValidCnpj("42.767.687/0001-35"), true);
  assert.equal(isValidCnpj("11.222.333/0001-80"), false);
  assert.equal(isValidCnpj("12.ABC.345/01DE-35"), true);
  assert.equal(isValidCnpj("12abc34501de35"), true, "minúsculas viram maiúsculas");
  assert.equal(isValidCnpj("12.ABC.345/01DE-36"), false);
  assert.equal(normalizeTaxDoc("12.abc.345/01de-35"), "12ABC34501DE35", "letras preservadas");
  assert.equal(isValidTaxDoc("529.982.247-25"), true);
});

test("telefone com +55, DDD e número", () => {
  assert.deepEqual(normalizePhone("+55 (55) 99999-8888"), { ddd: "55", numero: "999998888" });
  assert.deepEqual(normalizePhone("5535123456"), { ddd: "55", numero: "35123456" });
  assert.deepEqual(normalizePhone("555535123456"), { ddd: "55", numero: "35123456" });
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone(""), null);
});

test("e-mail opcional", () => {
  assert.equal(isValidEmail("a@b.com"), true);
  assert.equal(isValidEmail("a@b"), false);
  assert.equal(isValidEmail(null), false);
});

test("endpoint na allowlist *.atende.net", () => {
  assert.equal(isAllowedEndpoint("https://santarosa.atende.net/?pg=rest"), true);
  assert.equal(isAllowedEndpoint("https://ws-santarosa.atende.net:7443/?pg=rest"), true);
  assert.equal(isAllowedEndpoint("http://santarosa.atende.net/"), false);
  assert.equal(isAllowedEndpoint("https://atende.net.evil.com/"), false);
  assert.equal(isAllowedEndpoint("https://evil.com/santarosa.atende.net/"), false);
});

test("cidade Santa Rosa sem acento e sem caixa", () => {
  assert.equal(isSantaRosa("  SANTA rosa "), true);
  assert.equal(isSantaRosa("Santa Rosá"), true);
  assert.equal(isSantaRosa("Santo Ângelo"), false);
});

test("cadastro fiscal: erros por campo", () => {
  assert.deepEqual(
    validateNfseSettings({
      cnpj: "42767687000135",
      inscricaoMunicipal: "12345",
      codigoItemListaServico: "10.05.01",
      codigoNbs: "113040000",
      aliquotaIss: 3,
      situacaoTributaria: "0",
    }),
    {},
  );
  const e = validateNfseSettings({
    cnpj: "123",
    inscricaoMunicipal: "",
    codigoItemListaServico: "10.0",
    codigoNbs: "123",
    aliquotaIss: 6,
    situacaoTributaria: "a",
    endpointUrl: "https://evil.com/",
  });
  assert.deepEqual(Object.keys(e).sort(), [
    "aliquotaIss",
    "cnpj",
    "codigoItemListaServico",
    "codigoNbs",
    "endpointUrl",
    "inscricaoMunicipal",
    "situacaoTributaria",
  ]);
});
