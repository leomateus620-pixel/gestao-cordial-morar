import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalJson,
  civilDate,
  fiscalProfileSchema,
  fiscalReviewSchema,
  readFiscalProfile,
  resolveIssuer,
} from "./fiscal-profile.ts";

function approvedProfile() {
  return {
    operation: "administracao",
    tomadorPapel: "proprietario",
    valorOrigem: "valor_revisado",
    elegibilidade: "revisao_manual",
    descricao: "Serviço conforme enquadramento revisado",
    regime: "Regime revisado",
    localPrestacao: "8847",
    layout: "35/2021",
    regraFatoGerador: "revisao_manual",
    retencoes: { ir: 0, inss: 0, contribuicaoSocial: 0, rps: 0, pis: 0, cofins: 0, iss: 0 },
    ibsCbs: false,
    finNFSe: null,
    indFinal: null,
    tpOper: null,
    approvalReference: "Aprovação contábil de fixture sanitizada",
    productionAuthorization: null,
    automation: "assistida",
  };
}

test("marca ambas exige emissor explícito e valor desconhecido não vira Cordial", () => {
  assert.throws(() => resolveIssuer("ambas"), /explicitamente/);
  assert.equal(resolveIssuer("ambas", "cordial"), "cordial");
  assert.equal(resolveIssuer("ambas", "morar"), "morar");
  for (const value of ["", "Cordial", "desconhecida", "ambos"])
    assert.throws(() => resolveIssuer(value));
  assert.throws(() => resolveIssuer("cordial", "morar"), /difere/);
  assert.throws(() => resolveIssuer("morar", "inválido"), /difere/);
});

test("perfil fiscal não herda enquadramento, alíquota, retenções ou produção por default", () => {
  assert.equal(readFiscalProfile({}), null);
  assert.equal(readFiscalProfile(null), null);
  const profile = fiscalProfileSchema.parse(approvedProfile());
  assert.equal(profile.productionAuthorization, null);
  assert.equal(profile.automation, "assistida");
  for (const field of [
    "operation",
    "tomadorPapel",
    "valorOrigem",
    "elegibilidade",
    "regime",
    "retencoes",
    "approvalReference",
  ]) {
    const input: Record<string, unknown> = { ...approvedProfile() };
    delete input[field];
    assert.equal(fiscalProfileSchema.safeParse(input).success, false, field);
  }
  assert.equal(
    fiscalProfileSchema.safeParse({ ...approvedProfile(), automation: "automatica" }).success,
    false,
  );
  assert.equal(
    fiscalProfileSchema.safeParse({ ...approvedProfile(), productionAuthorization: "sim" }).success,
    false,
  );
});

test("retenções preservam zero e rejeitam percentuais não finitos/fora do intervalo", () => {
  assert.equal(fiscalProfileSchema.parse(approvedProfile()).retencoes.iss, 0);
  for (const invalid of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY, null]) {
    assert.equal(
      fiscalProfileSchema.safeParse({
        ...approvedProfile(),
        retencoes: { ...approvedProfile().retencoes, ir: invalid },
      }).success,
      false,
    );
  }
});

test("revisão exige data civil real, valor positivo, tomador fiscal e origem da decisão", () => {
  const review = {
    valor: 321.45,
    dataFatoGerador: "2026-09-30",
    tomador: {
      nome: "Pessoa de teste",
      documento: "12ABC34501DE35",
      logradouro: "Rua fiscal",
      numero: "12",
      bairro: "Centro",
      cidadeTom: "8847",
      cep: "98900000",
    },
    motivo: "Conferência da documentação histórica da ocorrência",
  };
  assert.equal(fiscalReviewSchema.parse(review).tomador.documento, "12ABC34501DE35");
  for (const value of ["2026-02-29", "2026-09-31", "2026-09-30T12:00:00Z", "2026-13-01"]) {
    assert.equal(civilDate.safeParse(value).success, false, value);
    assert.equal(
      fiscalReviewSchema.safeParse({ ...review, dataFatoGerador: value }).success,
      false,
    );
  }
  assert.equal(civilDate.safeParse("2028-02-29").success, true);
  assert.equal(fiscalReviewSchema.safeParse({ ...review, valor: 0 }).success, false);
  assert.equal(fiscalReviewSchema.safeParse({ ...review, motivo: "" }).success, false);
  assert.equal(
    fiscalReviewSchema.safeParse({ ...review, tomador: { ...review.tomador, logradouro: "" } })
      .success,
    false,
  );
});

test("JSON canônico ordena objetos e preserva ordem de referências, zero e documentos", () => {
  assert.equal(
    canonicalJson({ b: { z: 1, a: 0 }, a: "0012ABC" }),
    canonicalJson({ a: "0012ABC", b: { a: 0, z: 1 } }),
  );
  assert.notEqual(canonicalJson({ values: [0, 1] }), canonicalJson({ values: [1, 0] }));
  assert.notEqual(canonicalJson({ valor: 0 }), canonicalJson({ valor: null }));
  assert.equal(canonicalJson({ optional: undefined, value: 1 }), '{"value":1}');
});
