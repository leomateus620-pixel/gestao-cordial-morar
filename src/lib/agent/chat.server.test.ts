import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  createAssistantResponse,
  hasUsefulToolData,
  lovableCompletion,
  PrivateTextStream,
  safeAssistantText,
  type AssistantTurnDeps,
  type GatewayRequest,
} from "./chat.server";
import { getAgentBot } from "./bots";
import type { AssistantEvent } from "./stream";
import { readAssistantStream } from "./stream";
import { chatAssistantInput } from "./schemas";

const conversationId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const call = (name = "agenda_today", id = "call-1", args = "{}") => ({ name, id, arguments: args });
function setup() {
  const audits: unknown[][] = [],
    saved: unknown[][] = [],
    executions: string[] = [],
    requests: GatewayRequest[] = [];
  const deps: AssistantTurnDeps = {
    bot: getAgentBot("agenda")!,
    ctx: { supabase: {} as any, userId, roles: ["admin"], agencies: ["cordial"] },
    tools: [
      {
        name: "agenda_today",
        title: "Consultando agenda",
        description: "Agenda",
        roles: ["admin", "corretor"],
        inputSchema: z.object({}).strict(),
        handler: async () => {
          throw new Error("unused");
        },
      },
    ],
    persistence: {
      conversationId,
      history: [],
      audit: async (...args) => {
        audits.push(args);
      },
      saveAssistant: async (...args) => {
        saved.push(args);
      },
    },
    gateway: async (request) => {
      requests.push(request);
      if (request.tools.length)
        return requests.length === 1
          ? { text: "Especulação não deve aparecer.", calls: [call()] }
          : { text: "Planejamento não deve aparecer.", calls: [] };
      const text = "Encontrei um compromisso. Confira o cartão da agenda.";
      request.onText?.(text.slice(0, 20));
      request.onText?.(text.slice(20));
      return { text, calls: [] };
    },
    execute: async (name) => {
      executions.push(name);
      return {
        content: [{ type: "text", text: "1 compromisso." }],
        structuredContent: {
          events: [
            { id: "evento-fixture", title: "Visita teste", href: "/agenda?eventoId=fixture" },
          ],
          total: 1,
        },
      };
    },
  };
  return { deps, audits, saved, executions, requests };
}
async function run(deps: AssistantTurnDeps, message = "Minha agenda") {
  const events: AssistantEvent[] = [];
  const response = createAssistantResponse({ botId: "agenda", message }, deps);
  await readAssistantStream(response, (event) => events.push(event));
  return events;
}
const text = (events: AssistantEvent[]) =>
  events
    .filter((e) => e.type === "text")
    .map((e) => (e.type === "text" ? e.delta : ""))
    .join("");

test("turn queries allowed tools, streams final prose with tools disabled, persists and audits", async () => {
  const s = setup();
  const events = await run(s.deps);
  assert.deepEqual(s.executions, ["agenda_today"]);
  assert.equal(events[0].type, "conversation");
  assert.equal(events.at(-1)?.type, "done");
  assert.equal(text(events), "Encontrei um compromisso. Confira o cartão da agenda.");
  assert(!text(events).includes("Especulação"));
  assert.equal(s.requests.at(-1)?.tools.length, 0);
  assert.equal(s.saved[0][0], "Encontrei um compromisso. Confira o cartão da agenda.");
  assert(!JSON.stringify(s.saved).includes("Visita teste"));
  assert(!JSON.stringify(s.saved).includes("href"));
  assert.equal(s.audits[0][0], "agenda_today");
  assert.equal(events.filter((e) => e.type === "result").length, 1);
  assert.match(s.requests[0].messages[0].content!, /DADOS NÃO CONFIÁVEIS/);
});

test("no result guard replaces invented prose and empty records with não encontrei", async () => {
  const s = setup();
  s.deps.execute = async () => ({
    content: [{ type: "text", text: "Não encontrei compromissos para esse dia." }],
    structuredContent: { events: [], total: 0 },
  });
  const events = await run(s.deps);
  assert.equal(text(events), "Não encontrei compromissos para esse dia.");
  assert.equal(s.requests.length, 2, "empty reads skip the final model call");
  assert.equal(hasUsefulToolData("get_record_context", { record: null, total: 0 }), false);
  assert.equal(hasUsefulToolData("search_properties", { properties: [], total: 0 }), false);
  assert.equal(
    hasUsefulToolData("portfolio_summary", { total: 0 }),
    true,
    "zero is valid in an actual aggregate",
  );
});

test("no tool read means no invented business answer", async () => {
  const s = setup();
  s.deps.gateway = async () => ({ text: "Você tem 99 visitas e R$ 9000.", calls: [] });
  const events = await run(s.deps);
  assert.match(text(events), /Não encontrei/);
  assert(!text(events).includes("99"));
  assert.equal(s.executions.length, 0);
});

test("unknown, forbidden and bot-unlisted tool names never execute", async () => {
  for (const name of [
    "emit_nfse",
    "publish_property",
    "delete_client",
    "prepare_agenda_event",
    "web_research",
  ]) {
    const s = setup();
    let count = 0;
    s.deps.gateway = async () => ({ text: "", calls: count++ ? [] : [call(name)] });
    const events = await run(s.deps);
    assert.equal(s.executions.length, 0);
    assert.match(text(events), /Não encontrei/);
    assert.equal(s.audits[0][0], "blocked_tool");
  }
});
test("generic record lookup cannot cross the bot's declared module boundaries", async () => {
  for (const [botId, kind] of [
    ["agenda", "rental"],
    ["lead", "property"],
  ]) {
    const s = setup();
    s.deps.bot = getAgentBot(botId)!;
    s.deps.tools = [
      {
        ...s.deps.tools[0],
        name: "get_record_context",
        inputSchema: z.object({ kind: z.string(), id: z.string().uuid() }).strict(),
      },
    ];
    let requests = 0;
    s.deps.gateway = async () => ({
      text: "",
      calls: requests++
        ? []
        : [call("get_record_context", "context-call", JSON.stringify({ kind, id: userId }))],
    });
    const events = await run(s.deps);
    assert.equal(s.executions.length, 0, `${botId} cannot read ${kind}`);
    assert(!events.some((event) => event.type === "result"));
    assert.match(text(events), /Não encontrei/);
  }
});
test("unsupported navigation context is rejected before any provider or record query", async () => {
  const s = setup();
  const events: AssistantEvent[] = [];
  let providerCalls = 0;
  s.deps.gateway = async () => {
    providerCalls++;
    return { text: "", calls: [] };
  };
  await readAssistantStream(
    createAssistantResponse(
      { botId: "agenda", message: "Resuma este contrato", context: { kind: "rental", id: userId } },
      s.deps,
    ),
    (event) => events.push(event),
  );
  assert.equal(providerCalls, 0);
  assert.equal(s.executions.length, 0);
  assert.equal(events.at(-1)?.type, "error");
});

test("maximum eight calls includes parallel batches and sends only paired tool call messages", async () => {
  const s = setup();
  s.deps.gateway = async (request) => {
    s.requests.push(request);
    if (request.tools.length)
      return {
        text: "",
        calls: Array.from({ length: 12 }, (_, i) => call("agenda_today", `call-${i}`)),
      };
    request.onText?.("Confira a agenda.");
    return { text: "Confira a agenda.", calls: [] };
  };
  const events = await run(s.deps);
  assert.equal(s.executions.length, 8);
  assert.equal(s.requests.at(-1)?.messages.filter((m) => m.role === "tool").length, 8);
  assert.equal(s.requests.at(-1)?.messages.find((m) => m.tool_calls)?.tool_calls?.length, 8);
  assert.match(text(events), /limite de consultas/);
});

test("model parameters and all outputs are masked, including fragmented contacts", async () => {
  const s = setup();
  s.deps.gateway = async (request) => {
    s.requests.push(request);
    if (request.tools.length)
      return s.requests.length === 1 ? { text: "", calls: [call()] } : { text: "", calls: [] };
    for (const part of [
      "E-mail: ana",
      "@example.",
      "invalid. CPF: 123.",
      "456.789",
      "-09. Fone: (55) 9",
      "9999-0000. ",
    ])
      request.onText?.(part);
    return { text: "", calls: [] };
  };
  const events = await run(s.deps, "Meu e-mail é fixture@example.invalid e CPF 123.456.789-09");
  assert(!s.requests[0].messages.at(-1)?.content?.includes("fixture@example.invalid"));
  assert(!text(events).includes("ana@example.invalid"));
  assert(!text(events).includes("123.456.789-09"));
  assert(!text(events).includes("99999-0000"));
  assert.equal(s.saved[0][0], "E-mail: a***@***.invalid. CPF: ***.***.***-09. Fone: (**) *****-0000. ");
});

test("every possible split of CPF, phone and email stays masked in each emitted chunk", () => {
  for (const original of [
    "Contato ana.silva@example.invalid. Próximo.",
    "Contato ana@imóveis.com.br. Próximo.",
    "Contato joão.silva@imobiliária.com. Próximo.",
    "CPF 123.456.789-09. Próximo.",
    "Fone (55) 99999-0000. Próximo.",
  ]) {
    for (let split = 0; split <= original.length; split++) {
      const pieces: string[] = [];
      const stream = new PrivateTextStream((value) => pieces.push(value));
      stream.push(original.slice(0, split));
      stream.push(original.slice(split));
      stream.finish();
      const combined = pieces.join("");
      assert(!combined.includes("ana.silva@example.invalid"));
      assert(!combined.includes("123.456.789-09"));
      assert(!combined.includes("99999-0000"));
      assert(!combined.includes("ana@imóveis.com.br"));
      assert(!combined.includes("joão.silva@imobiliária.com"));
    }
  }
});

test("deadline interrupts a gateway that ignores abort and returns an honest error", async () => {
  const s = setup();
  s.deps.timeoutMs = 15;
  s.deps.gateway = () => new Promise(() => {});
  const events = await run(s.deps);
  assert.equal(events.at(-1)?.type, "error");
  assert.equal(s.saved.length, 0);
});

test("request abort cancels the provider and never executes a late tool", async () => {
  const s = setup(),
    controller = new AbortController();
  s.deps.signal = controller.signal;
  s.deps.gateway = async (request) =>
    new Promise((_, reject) =>
      request.signal.addEventListener("abort", () => reject(new Error("abort"))),
    );
  setTimeout(() => controller.abort(), 10);
  const events = await run(s.deps);
  assert.equal(events.at(-1)?.type, "error");
  assert.equal(s.executions.length, 0);
});
test("the first operational event is available before a slow provider replies", async () => {
  const s = setup();
  s.deps.gateway = () => new Promise(() => {});
  s.deps.timeoutMs = 500;
  const response = createAssistantResponse({ botId: "agenda", message: "Agenda hoje" }, s.deps);
  const reader = response.body!.getReader();
  const first = await Promise.race([
    reader.read(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("first event delayed")), 100),
    ),
  ]);
  assert(new TextDecoder().decode(first.value).includes('"type":"conversation"'));
  await reader.cancel();
});
test("hung audit or save cannot bypass the turn deadline; cancellation audit is attempted once", async () => {
  for (const hung of ["audit", "save"] as const) {
    const s = setup();
    s.deps.timeoutMs = 15;
    let errors = 0;
    s.deps.persistence.audit = async (name) => {
      if (name === "chat_error") {
        errors++;
        return;
      }
      if (hung === "audit") await new Promise(() => {});
    };
    if (hung === "save") s.deps.persistence.saveAssistant = () => new Promise(() => {});
    const events = await run(s.deps);
    assert.equal(events.at(-1)?.type, "error");
    assert.equal(errors, 1);
    assert(!events.some((event) => event.type === "done"));
  }
});

function sseResponse(data: string) {
  const bytes = new TextEncoder().encode(data);
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
        controller.close();
      },
    }),
  );
}
test("Lovable adapter joins fragmented names/arguments and UTF-8 SSE data", async () => {
  const raw =
    [
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: "call-1", function: { name: "agenda_", arguments: '{"date":' } },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { name: "today", arguments: '"2026-10-16"}' } }],
            },
            finish_reason: "tool_calls",
          },
        ],
      },
    ]
      .map((x) => `data: ${JSON.stringify(x)}\n\n`)
      .join("") + "data: [DONE]\n\n";
  const output = await lovableCompletion(
    { messages: [], tools: [], signal: new AbortController().signal },
    { apiKey: "fake-fixture", model: "fixture-model", fetcher: async () => sseResponse(raw) },
  );
  assert.deepEqual(output.calls, [
    { name: "agenda_today", id: "call-1", arguments: '{"date":"2026-10-16"}' },
  ]);
});

test("Lovable adapter rejects a premature SSE EOF", async () => {
  const raw = `data: ${JSON.stringify({ choices: [{ delta: { content: "Resposta parcial" } }] })}\n\n`;
  await assert.rejects(
    () =>
      lovableCompletion(
        { messages: [], tools: [], signal: new AbortController().signal },
        { apiKey: "fixture", model: "fixture", fetcher: async () => sseResponse(raw) },
      ),
    /incomplete_response/,
  );
});
test("provider transport/rate failures do not expose error response bodies", async () => {
  const request = { messages: [], tools: [], signal: new AbortController().signal };
  await assert.rejects(
    () =>
      lovableCompletion(request, {
        apiKey: "fixture",
        model: "fixture",
        fetcher: async () =>
          new Response("upstream secret fixture@example.invalid", { status: 429 }),
      }),
    /^Error: gateway_rate_limit$/,
  );
  await assert.rejects(
    () =>
      lovableCompletion(request, {
        apiKey: "fixture",
        model: "fixture",
        fetcher: async () => {
          throw new Error("network unavailable");
        },
      }),
    /network unavailable/,
  );
});

test("model supplied links and HTML are never actionable output", () => {
  assert.equal(
    safeAssistantText(
      "Veja [registro](https://evil.invalid) <script>run()</script> https://evil.invalid/novo",
    ),
    "Veja registro run() [fonte nos cartões]",
  );
  assert.equal(
    chatAssistantInput.safeParse({ botId: "agenda", message: "oi", model: "untrusted" }).success,
    false,
  );
  assert.equal(
    chatAssistantInput.safeParse({ botId: "agenda", message: "x".repeat(4001) }).success,
    false,
  );
});

test("structured choice ends the turn without executing later tools or inventing prose", async () => {
  const s = setup();
  s.deps.gateway = async () => ({
    text: "Você tem 99 visitas",
    calls: [
      call(
        "request_user_choice",
        "choose-period",
        JSON.stringify({ question: "Qual período?", choices: ["Hoje", "Amanhã"] }),
      ),
      call("agenda_today", "should-not-run"),
    ],
  });
  const events = await run(s.deps);
  assert.equal(s.executions.length, 0);
  const choice = events.find((e) => e.type === "choice");
  assert(choice?.type === "choice");
  assert.deepEqual(
    choice.choice.options.map((o) => o.value),
    ["Hoje", "Amanhã"],
  );
  assert.equal(text(events), "");
  assert.equal(s.requests.length, 0);
  assert.equal(events.at(-1)?.type, "done");
  assert(!JSON.stringify(s.saved).includes("Qual período"));
});

test("availability is rechecked before consulting any tool", async () => {
  const s = setup();
  let checks = 0;
  s.deps.validateBot = async () => {
    if (++checks === 2) throw new Error("bot_disabled");
  };
  const events = await run(s.deps);
  assert.equal(s.executions.length, 0);
  assert(!events.some((e) => e.type === "result"));
});

test("pending choice then pending action: fake gateway flow across two turns", async () => {
  const { actionSchemas } = await import("./actions");
  let pending: { choice?: any; action?: any } = {};
  const saved: unknown[][] = [];
  const persistence = {
    conversationId,
    history: [] as Array<{ role: "user" | "assistant"; content: string }>,
    get pending() {
      return pending;
    },
    audit: async () => {},
    saveAssistant: async (content: string, results: AssistantResult[]) => {
      saved.push([content, results]);
      persistence.history.push({ role: "assistant", content });
    },
    savePendingChoice: async (data: any) => {
      pending = { choice: data, action: undefined };
    },
    savePendingAction: async (data: any) => {
      pending = { choice: undefined, action: data };
    },
    clearPending: async () => {
      pending = {};
    },
  };
  const baseDeps: AssistantTurnDeps = {
    bot: getAgentBot("agenda")!,
    ctx: { supabase: {} as any, userId, roles: ["admin"], agencies: ["cordial"] },
    tools: [
      {
        name: "prepare_agenda_event",
        title: "Preparar compromisso",
        description: "Prepara um compromisso.",
        roles: ["admin", "secretaria", "corretor"],
        inputSchema: actionSchemas.agenda_event,
        handler: async () => {
          throw new Error("unused");
        },
      },
    ],
    persistence: persistence as any,
    gateway: async () => ({ text: "", calls: [] }),
    execute: async () => {
      throw new Error("should not execute prepare_* directly in this scenario");
    },
  };

  // Turn 1: "lance uma agenda amanhã" -> model asks Visita/Reunião via request_user_choice.
  const turn1Deps: AssistantTurnDeps = {
    ...baseDeps,
    gateway: async (request) => {
      if (request.tools.length)
        return {
          text: "",
          calls: [
            call(
              "request_user_choice",
              "choose-kind",
              JSON.stringify({ question: "Que tipo de compromisso?", choices: ["Visita", "Reunião"] }),
            ),
          ],
        };
      return { text: "", calls: [] };
    },
  };
  const events1 = await run(turn1Deps, "lance uma agenda amanhã");
  persistence.history.push({ role: "user", content: "lance uma agenda amanhã" });
  const choiceEvent = events1.find((e) => e.type === "choice");
  assert(choiceEvent?.type === "choice");
  assert.deepEqual(choiceEvent.choice.options.map((o) => o.value), ["Visita", "Reunião"]);
  assert.deepEqual(pending.choice, {
    question: "Que tipo de compromisso?",
    options: ["Visita", "Reunião"],
    tool_context: undefined,
  });

  // Turn 2: "Visita" -> model receives the pending choice as a system message
  // (data, not instruction) and calls prepare_agenda_event with incomplete fields.
  let turn2SystemMessages: string[] = [];
  const turn2Deps: AssistantTurnDeps = {
    ...baseDeps,
    gateway: async (request) => {
      if (request.tools.length) {
        turn2SystemMessages = request.messages
          .filter((m) => m.role === "system")
          .map((m) => m.content ?? "");
        return {
          text: "",
          calls: [
            call(
              "prepare_agenda_event",
              "prepare-1",
              JSON.stringify({ title: "Visita", kind: "visita" }),
            ),
          ],
        };
      }
      return { text: "", calls: [] };
    },
  };
  const events2 = await run(turn2Deps, "Visita");
  assert(
    turn2SystemMessages.some(
      (m) => m.includes("Pendência anterior") && m.includes("Que tipo de compromisso"),
    ),
  );
  assert.equal(pending.choice, undefined, "the pending choice is cleared once consumed");
  assert(pending.action, "a pending action is stored for the incomplete prepare_* call");
  assert.equal(pending.action.tool, "prepare_agenda_event");
  assert(pending.action.missing.includes("start"));
  assert(pending.action.missing.includes("end"));
  assert(pending.action.missing.includes("agency"));
  assert.deepEqual(pending.action.filled, { title: "Visita", kind: "visita" });
  assert.equal(events2.at(-1)?.type, "done");
});
