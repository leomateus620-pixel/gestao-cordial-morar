import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { BotConfigEditorView, McpClientsView } from "./AssistantConfiguration";
import { ChoiceQuestion } from "./ChoiceQuestion";
import { saveAssistantDraft, takeAssistantDraft } from "./draft-handoff";

test("unapproved MCP clients require approval and approved clients can only be revoked", () => {
  let writes = 0;
  const html = renderToStaticMarkup(
    <McpClientsView
      oauthConfigured
      clients={[
        {
          clientId: "test-pending",
          name: "Cliente pendente",
          approved: false,
          revision: 0,
          updatedAt: null,
        },
        {
          clientId: "test-approved",
          name: "Cliente aprovado",
          approved: true,
          revision: 2,
          updatedAt: null,
        },
      ]}
      onClient={() => {
        writes++;
        return true;
      }}
    />,
  );
  assert.match(html, /Não aprovado/);
  assert.match(html, />Aprovar</);
  assert.match(html, /Propostas aprovadas/);
  assert.match(html, />Revogar</);
  assert.match(html, /Cada pessoa ainda autoriza sua própria conta/);
  assert.equal(writes, 0);
});

test("unavailable OAuth discovery is explicit and does not simulate a connection", () => {
  const html = renderToStaticMarkup(
    <McpClientsView clients={[]} oauthConfigured={false} onClient={() => true} />,
  );
  assert.match(html, /Descoberta de clientes OAuth indisponível/);
  assert.match(html, /Nenhuma conexão aprovada/);
  assert.doesNotMatch(html, />Conectado</);
});

test("bot configuration presents review before any write and preserves fixed permissions", () => {
  let writes = 0;
  const html = renderToStaticMarkup(
    <BotConfigEditorView
      config={{
        id: "agenda",
        enabled: true,
        instructions: "",
        suggestions: ["Minha agenda hoje"],
        revision: 3,
        updatedAt: null,
      }}
      onSave={() => {
        writes++;
        return true;
      }}
      onReset={() => {
        writes++;
        return true;
      }}
    />,
  );
  assert.match(html, /Revisar alterações/);
  assert.match(html, /Restaurar padrão/);
  assert.match(html, /Permissões, privacidade e confirmação permanecem fixas/);
  assert.equal(writes, 0);
});

test("a structured choice asks for an answer and never presents business confirmation", () => {
  let responses = 0;
  const html = renderToStaticMarkup(
    <ChoiceQuestion
      choice={{
        id: "choice-test",
        question: "Qual período?",
        options: [
          { id: "a", label: "Manhã", value: "Manhã" },
          { id: "b", label: "Tarde", value: "Tarde" },
        ],
        allowOther: true,
      }}
      onChoose={() => responses++}
      onOther={() => responses++}
    />,
  );
  assert.match(html, /<legend[^>]*>Qual período\?/);
  assert.match(html, /Outro…/);
  assert.doesNotMatch(html, />Confirmar</);
  assert.equal(responses, 0);
});

test("private draft handoff is scoped to the user and bot, expires, and is consumed once", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      setItem: (key: string, value: string) => values.set(key, value),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
    },
  });
  try {
    saveAssistantDraft("test-user-a", "agenda", "Rascunho privado");
    assert.equal(takeAssistantDraft("test-user-b", "agenda"), undefined);
    assert.equal(takeAssistantDraft("test-user-a", "match"), undefined);
    assert.equal(takeAssistantDraft("test-user-a", "agenda"), "Rascunho privado");
    assert.equal(takeAssistantDraft("test-user-a", "agenda"), undefined);
    values.set(
      "cordial:assistant:draft:test-user-a:agenda",
      JSON.stringify({ text: "Antigo", expires: Date.now() - 1 }),
    );
    assert.equal(takeAssistantDraft("test-user-a", "agenda"), undefined);
    assert.equal(values.size, 0);
  } finally {
    if (previous) Object.defineProperty(globalThis, "sessionStorage", previous);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});

