import { expect, test } from "vitest";
import { buildHandoffMessage } from "./handoff-message";
import type { Atendimento } from "@/types/atendimento";

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
  expect(msg).toContain("Novo atendimento — Maria Silva");
  expect(msg).toContain("Corretor responsável: Pablo Souza");
  expect(msg).toContain("Origem: Instagram");
  expect(msg).toContain("Interesse: Compra • Apartamento • 2 dormitórios");
  expect(msg).toContain("Bairro: Centro");
  expect(msg).toContain("Imóvel: AP-1042 — Residencial Bela Vista");
  expect(msg).toContain("Prioridade: Alta");
  expect(msg).toContain("Agendar visita");
  expect(msg).toContain("Obs.: Prefere contato após as 18h");
  expect(msg).toContain("Cadastrado por Bianca");
});

test("mensagem mínima omite linhas sem dados", () => {
  const msg = buildHandoffMessage(base);
  expect(msg).toContain("Corretor responsável: a definir");
  expect(msg).not.toContain("Bairro:");
  expect(msg).not.toContain("Orçamento:");
  expect(msg).not.toContain("Imóvel:");
  expect(msg).not.toContain("Obs.:");
  expect(msg).not.toContain("Próximo passo:");
});

test("orçamento parcial e trilha de aluguel", () => {
  const msg = buildHandoffMessage({
    ...base,
    finalidade: "aluguel",
    tipoImovel: "casa",
    orcamentoMax: 2500,
    corretorNome: "Felipe",
  });
  expect(msg).toContain("Interesse: Aluguel • Casa");
  expect(msg).toMatch(/Orçamento: até R\$/);
});
