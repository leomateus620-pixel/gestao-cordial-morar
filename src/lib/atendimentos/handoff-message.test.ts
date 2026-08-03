import assert from "node:assert/strict";
import test from "node:test";
import { buildHandoffMessage } from "./handoff-message.ts";
import type { Atendimento } from "../../types/atendimento.ts";


function assertContains(value: string, needle: string) {
  assert.ok(value.includes(needle), `esperava conter: ${needle}\n---\n${value}`);
}
function assertNotContains(value: string, needle: string) {
  assert.ok(!value.includes(needle), `não esperava conter: ${needle}\n---\n${value}`);
}
function assertMatches(value: string, re: RegExp) {
  assert.match(value, re);
}

const base: Atendimento = {
  id: "1",
  clienteNome: "Maria Silva",
  telefone: "54999990000",
  contatoPreferencial: "whatsapp",
  origem: "instagram",
  imobiliaria: "cordial",
  finalidade: "compra",
  tipoImovel: "apartamento",
  prioridade: "alta",
  status: "novo",
  pipelineStage: "primeiro_contato",
  historico: [],
  criadoEm: "2026-08-03T13:12:00.000Z",
  atualizadoEm: "2026-08-03T13:12:00.000Z",
};

test("mensagem completa é natural e cita corretor, interesse e próximo passo", () => {
  const msg = buildHandoffMessage(
    {
      ...base,
      corretorNome: "Leonardo Braga",
      email: "maria@ex.com",
      dormitorios: "2",
      bairroInteresse: "Centro",
      orcamentoMin: 250000,
      orcamentoMax: 320000,
      imovelCodigo: "AP-1042",
      imovelDescricao: "Residencial Bela Vista",
      proximoPasso: "agendar_visita",
      proximoRetorno: "2026-08-05T17:00:00.000Z",
      observacoes: "Prefere contato após as 18h",
    },
    "Bianca Regina",
  );
  assertContains(msg, "Oi, Leonardo! Tem um novo atendimento vinculado a você.");
  assertContains(msg, "Bianca acabou de falar com Maria Silva");
  assertContains(msg, "chegou pelo Instagram");
  assertContains(msg, "2 dormitórios");
  assertContains(msg, "no bairro Centro");
  assertContains(msg, "O imóvel de referência é o AP-1042 — Residencial Bela Vista.");
  assertContains(msg, "(54) 99999-0000");
  assertContains(msg, "prioridade desse atendimento é alta");
  assertContains(msg, "O próximo passo é agendar visita");
  assertContains(msg, "Observação: Prefere contato após as 18h");
});

test("não inclui e-mail do cliente nem assinatura de cadastro", () => {
  const msg = buildHandoffMessage(
    { ...base, corretorNome: "Leonardo", email: "maria@ex.com" },
    "Bianca",
  );
  assertNotContains(msg, "maria@ex.com");
  assertNotContains(msg, "Cadastrado por");
  assertNotContains(msg, "E-mail:");
});

test("mensagem mínima omite blocos sem dados", () => {
  const msg = buildHandoffMessage(base);
  assertContains(msg, "corretor a definir");
  assertNotContains(msg, "bairro");
  assertNotContains(msg, "orçamento");
  assertNotContains(msg, "imóvel de referência");
  assertNotContains(msg, "Observação:");
  assertNotContains(msg, "próximo passo");
});

test("orçamento parcial e trilha de aluguel", () => {
  const msg = buildHandoffMessage({
    ...base,
    finalidade: "aluguel",
    tipoImovel: "casa",
    orcamentoMax: 2500,
    corretorNome: "Felipe",
  });
  assertContains(msg, "Oi, Felipe!");
  assertContains(msg, "para aluguel");
  assertMatches(msg, /orçamento de até R\$/);
});
