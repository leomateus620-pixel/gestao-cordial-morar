import test from "node:test";
import assert from "node:assert/strict";
import { routeMessage } from "./router.ts";

function sseFetcher(text: string): typeof fetch {
  return (async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          controller.enqueue(
            enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`),
          );
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ usage: { total_tokens: 1 } })}\n\n`));
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
        },
      }),
      { status: 200 },
    )) as unknown as typeof fetch;
}

function brokenFetcher(): typeof fetch {
  return (async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
}

test("consulta: pergunta sobre imóveis existentes no sistema", async () => {
  const json = JSON.stringify({
    intent: "consulta",
    entidades: { bairro: "Centro", dormitorios: 2 },
    faltando: [],
    precisa_externo: false,
  });
  const { decision, tier } = await routeMessage("Quais apartamentos de 2 dormitórios tem no Centro?", {
    apiKey: "k",
    model: "m",
    fetcher: sseFetcher(json),
  });
  assert.equal(decision.intent, "consulta");
  assert.equal(decision.entidades.bairro, "Centro");
  assert.equal(decision.entidades.dormitorios, 2);
  assert.equal(tier, "fast");
});

test("analise: pedido de relatório mapeia para tier de análise", async () => {
  const json = JSON.stringify({
    intent: "analise",
    entidades: {},
    faltando: [],
    precisa_externo: false,
  });
  const { decision, tier } = await routeMessage("Monte um relatório comparando a carteira deste mês", {
    apiKey: "k",
    model: "m",
    fetcher: sseFetcher(json),
  });
  assert.equal(decision.intent, "analise");
  assert.equal(tier, "analysis");
});

test("pesquisa: pedido de dado externo marca precisa_externo", async () => {
  const json = JSON.stringify({
    intent: "pesquisa",
    entidades: {},
    faltando: [],
    precisa_externo: true,
  });
  const { decision, tier } = await routeMessage("Qual a previsão do IPCA deste mês?", {
    apiKey: "k",
    model: "m",
    fetcher: sseFetcher(json),
  });
  assert.equal(decision.intent, "pesquisa");
  assert.equal(decision.precisa_externo, true);
  assert.equal(tier, "fast");
});

test("acao: pedido de agendamento", async () => {
  const json = JSON.stringify({
    intent: "acao",
    entidades: { cliente: "Maria", data: "amanhã" },
    faltando: ["horário"],
    precisa_externo: false,
  });
  const { decision } = await routeMessage("Agende uma visita com a Maria amanhã", {
    apiKey: "k",
    model: "m",
    fetcher: sseFetcher(json),
  });
  assert.equal(decision.intent, "acao");
  assert.deepEqual(decision.faltando, ["horário"]);
});

test("conversa: saudação simples", async () => {
  const json = JSON.stringify({
    intent: "conversa",
    entidades: {},
    faltando: [],
    precisa_externo: false,
  });
  const { decision } = await routeMessage("Bom dia!", {
    apiKey: "k",
    model: "m",
    fetcher: sseFetcher(json),
  });
  assert.equal(decision.intent, "conversa");
});

test("JSON inválido do modelo cai no fallback heurístico, nunca lança", async () => {
  const { decision, tier } = await routeMessage("faça um relatório da carteira este mês", {
    apiKey: "k",
    model: "m",
    fetcher: sseFetcher("isto não é json"),
  });
  assert.equal(decision.intent, "analise");
  assert.equal(tier, "analysis");
});

test("resposta JSON com campo de intent inválido cai no fallback", async () => {
  const json = JSON.stringify({ intent: "banana", entidades: {}, faltando: [] });
  const { decision, tier } = await routeMessage("Quais clientes aguardam retorno?", {
    apiKey: "k",
    model: "m",
    fetcher: sseFetcher(json),
  });
  assert.equal(decision.intent, "consulta");
  assert.equal(tier, "fast");
});

test("falha de rede/gateway cai no fallback sem lançar", async () => {
  const { decision } = await routeMessage("Quais imóveis tem na Vila Rica?", {
    apiKey: "k",
    model: "m",
    fetcher: brokenFetcher(),
  });
  assert.equal(decision.intent, "consulta");
});
