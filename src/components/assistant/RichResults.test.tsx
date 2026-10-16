import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RichToolResult,
  RichPropertyCard,
  safeRecordHref,
  safeSourceUrl,
  StepTimeline,
} from "./RichResults";
import { WorkerAvatar } from "./WorkerAvatar";
import { allowedBotsForRole, getAgentBot } from "../../lib/agent/bots";

test("role catalog exposes only operational bots and reserves management capabilities", () => {
  assert.deepEqual(
    allowedBotsForRole("corretor").map((b) => b.id),
    ["agenda", "match", "capta", "lead"],
  );
  assert.equal(
    allowedBotsForRole("secretaria").some((b) => b.id === "caixa"),
    true,
  );
  assert.equal(
    allowedBotsForRole("secretaria").some((b) => b.id === "time"),
    false,
  );
  assert.equal(allowedBotsForRole("admin_owner").length, 7);
  assert.deepEqual(allowedBotsForRole("unknown"), []);
  for (const role of ["admin", "secretaria", "corretor"]) {
    assert.deepEqual(
      allowedBotsForRole(role)
        .filter((b) => b.active)
        .map((b) => b.id),
      ["agenda", "match", "capta", "lead"],
    );
  }
});
test("property result links only to a verified internal record and leaves absent photo honest", () => {
  const html = renderToStaticMarkup(
    <RichPropertyCard
      property={{
        id: "demo",
        codigo: "DEMO-101",
        tipo: "Apartamento",
        bairro: "Centro",
        valor: 420000,
        href: "/imoveis/demo",
      }}
    />,
  );
  assert.match(html, /DEMO-101/);
  assert.match(html, /420\.000/);
  assert.match(html, /href="\/imoveis\/demo"/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /Adicionar ao rascunho/);
});
test("rich results distinguish empty successful query, missing context and unavailable research", () => {
  const empty = renderToStaticMarkup(
    <RichToolResult result={{ tool: "search_clients", data: { clients: [], total: 0 } }} />,
  );
  assert.match(empty, /Não encontrei registros/);
  const context = renderToStaticMarkup(
    <RichToolResult result={{ tool: "get_record_context", data: { record: null, total: 0 } }} />,
  );
  assert.match(context, /Não encontrei esse registro no seu escopo/);
  const unavailable = renderToStaticMarkup(
    <RichToolResult
      result={{
        tool: "web_research",
        data: {
          status: "not_configured",
          sources: [],
          message: "Pesquisa externa não configurada.",
        },
      }}
    />,
  );
  assert.match(unavailable, /Pesquisa externa não configurada/);
  assert.doesNotMatch(unavailable, /Não encontrei registros/);
});
test("pending capture results do not fabricate expiration dates", () => {
  const html = renderToStaticMarkup(
    <RichToolResult
      result={{
        tool: "expiring_agenciamentos",
        data: { expirationAvailable: false, agenciamentos: [], total: 0 },
      }}
    />,
  );
  assert.match(html, /cadastro não informa vencimento/);
  assert.doesNotMatch(getAgentBot("capta")!.suggestions.join(" "), /vencendo/);
});
test("rich record and research links reject unsafe or unexpected schemes", () => {
  for (const value of [
    "javascript:alert(1)",
    "https://attacker.example",
    "//attacker.example",
    "/imoveis\\evil",
    "/configuracoes",
  ]) {
    assert.equal(safeRecordHref(value), undefined);
  }
  assert.equal(safeRecordHref("/atendimentos?id=demo"), "/atendimentos?id=demo");
  assert.equal(safeSourceUrl("javascript:alert(1)"), undefined);
  assert.equal(safeSourceUrl("https://user:secret@example.com"), undefined);
  const html = renderToStaticMarkup(
    <RichToolResult
      result={{
        tool: "web_research",
        data: {
          sources: [{ title: "Índice oficial de demonstração", url: "https://example.com/indice" }],
        },
      }}
    />,
  );
  assert.match(html, /href="https:\/\/example.com\/indice"/);
  assert.match(html, /noopener noreferrer/);
});
test("operational timeline announces actual step status and mascots have accessible names", () => {
  const steps = renderToStaticMarkup(
    <StepTimeline steps={[{ id: "1", label: "Consultando agenda do dia", status: "running" }]} />,
  );
  assert.match(steps, /Consultando agenda do dia/);
  assert.match(steps, /aria-expanded="false"/);
  const avatar = renderToStaticMarkup(<WorkerAvatar bot={getAgentBot("agenda")!} />);
  assert.match(avatar, /aria-label="Mascote Agenda"/);
});
