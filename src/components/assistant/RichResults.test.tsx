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
  for (const [role, count] of [
    ["admin", 7],
    ["secretaria", 5],
    ["corretor", 4],
  ] as const) {
    assert.equal(allowedBotsForRole(role).filter((bot) => bot.active).length, count);
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
  const selection = `/s/${"a".repeat(64)}`;
  assert.equal(safeRecordHref(selection), selection);
  assert.equal(safeRecordHref(`${selection}?redirect=https://example.com`), undefined);
  assert.equal(safeRecordHref("/s/not-a-token"), undefined);
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
test("fiscal and bonus summaries preserve useful fields and real module links", () => {
  const fiscal = renderToStaticMarkup(
    <RichToolResult
      result={{
        tool: "rental_nfse_alerts",
        data: {
          alerts: [
            {
              id: "demo",
              competencia: "2026-09",
              status: "incerto",
              teste: true,
              href: "/alugueis?id=demo",
            },
          ],
        },
      }}
    />,
  );
  assert.match(fiscal, /Pendência de NFS-e/);
  assert.match(fiscal, /2026-09/);
  assert.match(fiscal, /Teste/);
  assert.match(fiscal, /href="\/alugueis\?id=demo"/);
  const bonuses = renderToStaticMarkup(
    <RichToolResult
      result={{
        tool: "broker_bonus_summary",
        data: {
          bonuses: [
            {
              corretor: "Corretor de teste",
              nivel: 2,
              status: "conquistado",
              periodo: "2026-10",
              href: "/corretores?corretorId=demo",
            },
          ],
        },
      }}
    />,
  );
  assert.match(bonuses, /Corretor de teste/);
  assert.match(bonuses, /Nível 2/);
  assert.match(bonuses, /2026-10/);
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
