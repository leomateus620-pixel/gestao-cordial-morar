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

test("mensagem completa inclui corretor e campos preenchidos", () => {
  const msg = buildHandoffMessage(
    {
      ...base,
      corretorNome: "Pablo Souza",
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
    "Bianca",
  );
  assertContains(msg, "Novo atendimento — Maria Silva");
  assertContains(msg, "Corretor responsável: Pablo Souza");
  assertContains(msg, "Origem: Instagram");
  assertContains(msg, "Interesse: Compra • Apartamento • 2 dormitórios");
  assertContains(msg, "Bairro: Centro");
  assertContains(msg, "Imóvel: AP-1042 — Residencial Bela Vista");
  assertContains(msg, "Prioridade: Alta");
  assertContains(msg, "Agendar visita");
  assertContains(msg, "Obs.: Prefere contato após as 18h");
  assertContains(msg, "Cadastrado por Bianca");
});

test("mensagem mínima omite linhas sem dados", () => {
  const msg = buildHandoffMessage(base);
  assertContains(msg, "Corretor responsável: a definir");
  assertNotContains(msg, "Bairro:");
  assertNotContains(msg, "Orçamento:");
  assertNotContains(msg, "Imóvel:");
  assertNotContains(msg, "Obs.:");
  assertNotContains(msg, "Próximo passo:");
});

test("orçamento parcial e trilha de aluguel", () => {
  const msg = buildHandoffMessage({
    ...base,
    finalidade: "aluguel",
    tipoImovel: "casa",
    orcamentoMax: 2500,
    corretorNome: "Felipe",
  });
  assertContains(msg, "Interesse: Aluguel • Casa");
  assertMatches(msg, /Orçamento: até R\$/);
});
