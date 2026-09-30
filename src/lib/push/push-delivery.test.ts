import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  buildPushSummary,
  formatPushEventTime,
  isPushExpired,
  pushMaxAgeMinutes,
  pushRetryPlan,
} from "./push-delivery";
import { buildPushPresentation } from "./push-presentation";
import { getNotificationTypeConfig, resolveNotificationDestination } from "@/lib/notifications/notification-system";
import { authorizeWorkerRequest } from "@/lib/workers/hook-auth";

const NOW = new Date("2026-09-29T19:40:00Z"); // 16:40 em São Paulo

test("janela: 30 min para agenda, 10 min para o resto", () => {
  assert.equal(pushMaxAgeMinutes("agenda_lembrete"), 30);
  assert.equal(pushMaxAgeMinutes("agenda_fotos"), 30);
  assert.equal(pushMaxAgeMinutes("atendimento_iniciado"), 10);
  assert.equal(pushMaxAgeMinutes(null), 10);
});

test("evento velho não vira push individual (vai para resumo)", () => {
  const eleven = new Date(NOW.getTime() - 11 * 60_000).toISOString();
  const five = new Date(NOW.getTime() - 5 * 60_000).toISOString();
  assert.equal(isPushExpired("atendimento_iniciado", eleven, NOW), true);
  assert.equal(isPushExpired("atendimento_iniciado", five, NOW), false);
  assert.equal(isPushExpired("agenda_lembrete", eleven, NOW), false);
  assert.equal(isPushExpired("agenda_lembrete", new Date(NOW.getTime() - 31 * 60_000), NOW), true);
  // Caso real de 22/09 entregue em 29/09: expirado.
  assert.equal(isPushExpired("atendimento_iniciado", "2026-09-22T12:40:00Z", NOW), true);
});

test("resumo único por usuário, sem um push por item", () => {
  const summary = buildPushSummary({ atendimento_iniciado: 5, atendimento_atribuido: 2 });
  assert.match(summary.title, /7 avisos/);
  assert.equal(summary.body, "5 atendimentos iniciados e 2 atendimentos atribuídos. Veja todos na central de notificações.");
  assert.match(buildPushSummary({ venda_realizada: 1 }).body, /^1 venda realizada\./);
});

test("retry: 1/2/4/8 min e falha final após 5 tentativas", () => {
  const minutes = [1, 2, 3, 4].map((attempt) => {
    const plan = pushRetryPlan(attempt, NOW);
    assert.equal(plan.status, "failed");
    return (new Date(plan.nextAttemptAt!).getTime() - NOW.getTime()) / 60_000;
  });
  assert.deepEqual(minutes, [1, 2, 4, 8]);
  assert.deepEqual(pushRetryPlan(5, NOW), { status: "failed_final", nextAttemptAt: null });
});

test("horário do evento no corpo, fuso de São Paulo", () => {
  assert.equal(formatPushEventTime("2026-09-29T18:02:00Z", NOW), "às 15:02");
  assert.equal(formatPushEventTime("2026-09-28T12:46:00Z", NOW), "em 28/09 às 09:46");
  const p = buildPushPresentation({
    id: "x", type: "atendimento_iniciado", titulo: "Rafael Rodrigues", eventAt: "2026-09-29T18:02:00Z", now: NOW,
  });
  assert.equal(p.body, "Rafael Rodrigues\nÀs 15:02");
});

test("cada tipo tem apresentação própria, inclusive venda realizada", () => {
  for (const tipo of [
    "atendimento_iniciado", "atendimento_atribuido", "agenda_lembrete", "agenda_fotos",
    "venda_vencimento", "venda_realizada", "google_calendar",
  ]) {
    assert.notEqual(getNotificationTypeConfig(tipo).label, "Atualização do sistema", tipo);
  }
  const id = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(resolveNotificationDestination({ type: "venda_realizada", link: null, entityId: id }), {
    path: "/vendas", search: { id },
  });
  assert.match(buildPushPresentation({ id, type: "venda_realizada", titulo: "Venda" }).title, /Venda realizada/);
});

test("chave pública continua recusada pelos ganchos", () => {
  const previous = process.env.WORKER_HOOK_SECRET;
  process.env.WORKER_HOOK_SECRET = "private-secret-value";
  try {
    const denied = authorizeWorkerRequest(new Request("https://x.invalid", { headers: { apikey: "sb_publishable_abc" } }));
    assert.equal(denied?.status, 401);
  } finally {
    if (previous === undefined) delete process.env.WORKER_HOOK_SECRET;
    else process.env.WORKER_HOOK_SECRET = previous;
  }
});

test("worker: envio de um item, dedup por aparelho e credencial do cofre", () => {
  const source = readFileSync("src/routes/api/public/hooks/push-worker.ts", "utf8");
  assert.match(source, /push_outbox_claim_one/);
  assert.match(source, /internalTokenAuthorized/);
  assert.match(source, /alreadySent\.includes\(token\)/);
  assert.match(source, /isPushExpired/);
  assert.doesNotMatch(source, /sb_publishable_[A-Za-z0-9]{6,}/);
});

test("migração: gatilho usa credencial do cofre, registra erro e não reenvia fila antiga", () => {
  const dir = "supabase/migrations";
  const files = require("node:fs").readdirSync(dir) as string[];
  const sql = files
    .map((file) => readFileSync(`${dir}/${file}`, "utf8"))
    .find((text) => text.includes("push_outbox_claim_one"));
  assert.ok(sql, "migração do push encontrada");
  assert.match(sql!, /headers := public\.internal_worker_headers\(\)/);
  assert.doesNotMatch(sql!, /WHEN OTHERS THEN\s+NULL/);
  assert.match(sql!, /next_attempt_at IS NOT NULL AND o\.next_attempt_at <= now\(\)/);
  assert.match(sql!, /'push-outbox-retry', '\* \* \* \* \*'/);
  assert.match(sql!, /venda_realizada/);
  assert.doesNotMatch(sql!, /sale-payment-reminders/);
});
