import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionCardView, ActionEditor, AssistantActionCard, actionViewState } from "./ActionCard";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectionPanelView, MemoryPanelView, RoutinesPanelView } from "./AssistantControls";
import type { ActionProposal } from "../../lib/agent/actions";

const proposal: ActionProposal = {
  id: "00000000-0000-4000-8000-000000000201",
  type: "attendance_stage_change",
  botId: "lead",
  revision: 2,
  status: "pending",
  expiresAt: "2026-10-16T18:15:00-03:00",
  title: "Alterar etapa",
  summary: "Cliente de teste",
  diff: [{ label: "Etapa", before: "Primeiro contato", after: "Visita" }],
  payload: { attendanceId: "00000000-0000-4000-8000-000000000101", to: "visita" },
};
const now = Date.parse("2026-10-16T18:00:00-03:00");
test("a denied action lookup hides cached payload in chat and drawer until access is verified", () => {
  const client = new QueryClient();
  client.setQueryData(["assistant-action-access", proposal.id], true);
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AssistantActionCard action={proposal} />
      <AssistantActionCard action={proposal} />
    </QueryClientProvider>,
  );
  assert.equal([...html.matchAll(/Verificar acesso/g)].length, 2);
  assert.doesNotMatch(html, /Cliente de teste|Primeiro contato|Alterar etapa|>Confirmar</);
});
test("the same proposal in chat and pending drawer has unique DOM IDs", () => {
  const html = renderToStaticMarkup(
    <>
      <ActionCardView action={proposal} now={now} />
      <ActionCardView action={proposal} now={now} />
    </>,
  );
  const ids = [...html.matchAll(/ id="(assistant-action-[^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2);
  assert.equal([...html.matchAll(new RegExp(`data-action-id="${proposal.id}"`, "g"))].length, 2);
});
test("preview pending list receives completion and removes the needs-you count", async () => {
  const fixture = await import("../../../tests/assistant/transport-fixture");
  fixture.resetFixtureAction();
  let current: ActionProposal = fixture.fixtureAction;
  const stop = fixture.subscribeFixtureActions((action) => {
    current = action;
  });
  assert.equal([current].filter((action) => actionViewState(action, now) === "pending").length, 1);
  await fixture.confirmAssistantAction();
  assert.equal([current].filter((action) => actionViewState(action, now) === "pending").length, 0);
  stop();
  fixture.resetFixtureAction();
});
test("pending action exposes the actual diff and requires an explicit confirmation", () => {
  let executions = 0;
  const html = renderToStaticMarkup(
    <ActionCardView
      action={proposal}
      now={now}
      onConfirm={() => executions++}
      onEdit={() => {}}
      onCancel={() => {}}
    />,
  );
  assert.match(html, /Primeiro contato/);
  assert.match(html, /Visita/);
  assert.match(html, /Confirmar/);
  assert.match(html, /Editar/);
  assert.match(html, /Cancelar/);
  assert.equal(executions, 0);
});
test("expired or executing proposals never offer another confirmation", () => {
  const expired = renderToStaticMarkup(
    <ActionCardView
      action={proposal}
      now={Date.parse(proposal.expiresAt) + 1}
      onConfirm={() => {}}
    />,
  );
  assert.match(expired, /Expirado/);
  assert.doesNotMatch(expired, />Confirmar</);
  const executing = renderToStaticMarkup(
    <ActionCardView action={{ ...proposal, status: "confirmed" }} now={now} />,
  );
  assert.match(executing, /Confirmando/);
  assert.doesNotMatch(executing, />Confirmar</);
});
test("completed drafts remain copyable and never claim delivery", () => {
  const html = renderToStaticMarkup(
    <ActionCardView
      action={{
        ...proposal,
        type: "message_draft",
        status: "executed",
        payload: {
          attendanceId: "00000000-0000-4000-8000-000000000101",
          text: "Rascunho de teste",
        },
        result: { draft: "Olá, cliente de teste.", text: "Rascunho pronto." },
      }}
      now={now}
    />,
  );
  assert.match(html, /Copiar rascunho/);
  assert.doesNotMatch(html, /Enviado|Enviar mensagem|>Confirmar</);
});
test("editor uses labeled allowed fields without exposing payload IDs or raw JSON", () => {
  const html = renderToStaticMarkup(<ActionEditor action={proposal} onSave={() => {}} />);
  assert.match(html, /Nova etapa/);
  assert.match(html, /Motivo/);
  assert.match(html, /Atualizar proposta/);
  assert.doesNotMatch(html, /00000000-0000-4000-8000-000000000101|attendanceId|\{"/);
});
test("revoked authorization offers reconnection, configuration gaps do not pretend readiness", () => {
  const revoked = renderToStaticMarkup(
    <ConnectionPanelView
      readiness={{
        status: "needs_reauthorization",
        delegation: "revoked",
        schedulerEnabled: true,
        missing: [],
      }}
      onConnect={() => {}}
    />,
  );
  assert.match(revoked, /Conectar/);
  const unconfigured = renderToStaticMarkup(
    <ConnectionPanelView
      readiness={{
        status: "not_configured",
        delegation: "missing",
        schedulerEnabled: false,
        missing: ["client"],
      }}
    />,
  );
  assert.match(unconfigured, /Configuração pendente/);
  assert.doesNotMatch(unconfigured, /Prontas para os horários/);
});
test("routine query errors are not rendered as a successful empty list", () => {
  const html = renderToStaticMarkup(
    <RoutinesPanelView routines={[]} error="Não foi possível carregar as rotinas." />,
  );
  assert.match(html, /role="alert"/);
  assert.doesNotMatch(html, /Nenhuma rotina ainda/);
});
test("memory only offers structured work preferences with an explicit save", () => {
  const html = renderToStaticMarkup(<MemoryPanelView onSave={() => {}} onDelete={() => {}} />);
  assert.match(html, /Guardar preferências/);
  assert.match(html, /Bairros de foco/);
  assert.match(html, /Seu horário/);
  assert.doesNotMatch(html, /Instruções livres|proprietário|CPF/);
});
