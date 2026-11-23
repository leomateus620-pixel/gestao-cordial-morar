import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidCpf, sanitizeSpouse, spousePending, emptySpouse } from "./guarantor-spouse";
import { fillContract, qualifySpouse, missingFields, type ContractData } from "./contract-generator";
import { exitInspectionGate } from "./entry-inspection";

test("CPF válido e inválido", () => {
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("111.111.111-11"), false);
  assert.equal(isValidCpf("529.982.247-24"), false);
});

test("servidor recusa CPF inválido do cônjuge e ignora desligado", () => {
  assert.throws(() => sanitizeSpouse({ enabled: true, nome: "Ana", cpf: "123" }));
  assert.equal(sanitizeSpouse({ enabled: false, nome: "Ana" }), null);
});

test("cônjuge habilitado e incompleto fica pendente (rascunho permitido)", () => {
  const s = { ...emptySpouse(), enabled: true, nome: "Ana" };
  assert.ok(sanitizeSpouse(s));
  assert.ok(spousePending(s).includes("CPF do cônjuge"));
  assert.deepEqual(spousePending(emptySpouse()), []);
});

const base: ContractData = {
  brand: "cordial", guarantee: "fiador",
  locador: { label: "L", qualificacao: "JOSÉ, x" },
  locatarios: [{ label: "T", qualificacao: "MARIA, x" }],
  fiadores: [], imovelEndereco: "Rua A, 1", matricula: "1", bensFiadores: "casa",
  dataInicio: "2026-01-01", dataAssinatura: "2026-01-01", valorAluguel: 1000,
  valorCaucao: null, insurer: null, seguroValorMensal: null, seguroParcelas: 12,
};

test("cônjuge só no bloco e na assinatura do seu fiador", () => {
  const sp = qualifySpouse({ papel: "esposa", nome: "Ana Souza", cpf: "529.982.247-25", rg: "12.345", profissao: "professora" });
  const text = fillContract("{{fiadores}}\n{{assinaturas}}", {
    ...base,
    fiadores: [
      { label: "F", qualificacao: "PEDRO, a" },
      { label: "F", qualificacao: "CARLOS, b", conjuge: sp },
    ],
  });
  assert.ok(text.includes("CARLOS, b, e sua esposa, ANA SOUZA"));
  assert.ok(!text.includes("PEDRO, a, e sua"));
  assert.ok(text.includes("Esposa anuente do(a) fiador(a) CARLOS"));
  assert.equal((text.match(/Fiador\(a\)\n/g) ?? []).length, 2);
  assert.deepEqual(missingFields(text), []);
});

test("cônjuge incompleto bloqueia a geração", () => {
  const sp = qualifySpouse({ papel: "conjuge", nome: "Ana", cpf: "", rg: "", profissao: "x" });
  const text = fillContract("{{fiadores}}", { ...base, fiadores: [{ label: "F", qualificacao: "P, a", conjuge: sp }] });
  assert.ok(missingFields(text).length > 0);
});

test("saída só libera com entrada concluída e termo registrado", () => {
  assert.equal(exitInspectionGate({ id: null, status: null, hasDocument: false }).unlocked, false);
  assert.equal(exitInspectionGate({ id: "e", status: "em_revisao", hasDocument: true }).unlocked, false);
  assert.equal(exitInspectionGate({ id: "e", status: "concluida", hasDocument: false }).unlocked, false);
  assert.equal(exitInspectionGate({ id: "e", status: "concluida", hasDocument: true }).unlocked, true);
});
