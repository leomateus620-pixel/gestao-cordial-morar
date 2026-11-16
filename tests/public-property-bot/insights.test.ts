import test from "node:test";
import assert from "node:assert/strict";
import { insightQuestion, recordInsight } from "../../src/lib/public-property-bot/insights.server";
import { describeSearch, evolutionLabel } from "../../src/lib/public-bot-insights/summaries";
import {
  insightDaysSchema,
  botConversationSchema,
} from "../../src/lib/public-bot-insights/contracts";
import {
  botOperationalEventSchema,
  botSessionInputSchema,
} from "../../src/lib/public-property-bot/contracts";

test("internal question snapshots minimize contacts, documents, markup and links", () => {
  const text = insightQuestion({
    kind: "text",
    text: "Me chamo Pessoa Sintética. Quero casa até 650 mil, contato synthetic@example.test, CPF 123.456.789-00, telefone (55) 99999-9999. <script>segredo</script>https://private.invalid/token",
  });
  assert.match(text, /650 mil/);
  for (const privateValue of [
    "Pessoa Sintética",
    "synthetic@example",
    "123.456",
    "99999",
    "script",
    "segredo",
    "private.invalid",
  ])
    assert(!text.includes(privateValue));
  assert(insightQuestion({ kind: "text", text: "x".repeat(1800) }).length <= 1000);
});
test("filter summaries preserve independent operators, unknown values and monthly budget", () => {
  const text = describeSearch({
    operation: "aluguel",
    bedrooms: { op: "eq", value: 2 },
    bathrooms: { op: "gte", value: 2 },
    budget: { min: { value: 1000, inclusive: false }, max: { value: 3000, inclusive: true } },
    suites: null,
  });
  assert.match(text, /2 quartos/);
  assert.match(text, /2\+ banheiros/);
  assert.match(text, /acima de/);
  assert.match(text, /até/);
  assert.match(text, /por mês/);
  assert(!text.includes("suítes"));
  assert.equal(describeSearch({}), "Preferências ainda não definidas");
});
test("click contracts never accept visitor transcripts, roles, brands or a card without its id", () => {
  const event = {
    kind: "contact_click",
    eventId: "00000000-0000-4000-8000-000000000001",
    source: "header",
    publicId: null,
  };
  assert(botOperationalEventSchema.safeParse(event).success);
  for (const patch of [
    { brand: "morar" },
    { text: "privado" },
    { role: "admin" },
    { source: "card" },
    { publicId: event.eventId },
  ])
    assert(!botOperationalEventSchema.safeParse({ ...event, ...patch }).success);
  assert(botSessionInputSchema.safeParse({}).success);
  assert(botSessionInputSchema.safeParse({ openingId: event.eventId }).success);
  assert(!botSessionInputSchema.safeParse({ openingId: event.eventId, ip: "1.2.3.4" }).success);
});
test("failed internal measurement does not abort a property search or log visitor content", async () => {
  const original = console.warn,
    logged: unknown[][] = [];
  console.warn = (...args) => logged.push(args);
  try {
    await recordInsight("turn", "morar", async () => {
      throw new Error("PRIVATE-PROMPT-SECRET");
    });
    assert.equal(logged.length, 1);
    assert(!JSON.stringify(logged).includes("PRIVATE"));
  } finally {
    console.warn = original;
  }
});
test("admin period and DTO contracts reject unsupported ranges and authentication data", () => {
  for (const days of [1, 7, 30]) assert(insightDaysSchema.safeParse(days).success);
  for (const days of [0, 365, "30", null]) assert(!insightDaysSchema.safeParse(days).success);
  const session = {
    id: "00000000-0000-4000-8000-000000000001",
    brand: "cordial",
    startedAt: "2026-11-16T12:00:00Z",
    lastActivityAt: "2026-11-16T12:00:00Z",
    messages: 0,
    whatsapp: 0,
    initialFilters: {},
    latestFilters: {},
    resultCount: 0,
  };
  assert(botConversationSchema.safeParse(session).success);
  assert(!botConversationSchema.safeParse({ ...session, tokenHash: "secret" }).success);
});
test("conversation-only answers are distinct from an empty search and WhatsApp is a click", () => {
  const event = {
    at: "2026-11-16T12:00:00Z",
    kind: "turn" as const,
    requestId: null,
    state: "completed" as const,
    question: "Olá",
    answer: "Olá",
    revision: 1,
    filters: {},
    resultCount: 0,
    outcome: "answer" as const,
    publicIds: [],
    source: null,
  };
  assert.equal(evolutionLabel(event), "Conversa e refinamento da busca");
  assert.match(evolutionLabel({ ...event, outcome: "empty" }), /Nenhum imóvel/);
  assert.equal(evolutionLabel({ ...event, kind: "whatsapp" }), "Clicou no WhatsApp");
});
