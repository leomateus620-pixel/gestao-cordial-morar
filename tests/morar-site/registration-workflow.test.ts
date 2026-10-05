import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { kickOwnedMorarImageWorker } from "../../src/lib/morar-site/image-worker.server.ts";
import { prepareOwnedMorarRegistration } from "../../src/lib/morar-site/registration-workflow.ts";

test("canal próprio persiste intenção antes do agenciamento sem envio externo", async () => {
  const calls: string[] = [];
  const result = await prepareOwnedMorarRegistration({
    persistIntent: async () => {
      calls.push("intenção");
      return { ok: true, state: "draft", active: false };
    },
    ensureAgency: async () => {
      calls.push("agenciamento");
      return { status: "created", id: "agency" };
    },
  });
  assert.deepEqual(calls, ["intenção", "agenciamento"]);
  assert.equal(result.decision.active, false);
  assert.equal(result.agency.id, "agency");
});

test("conflito ou ausência de intenção durável impede criar agenciamento", async () => {
  let agencyCreated = false;
  await assert.rejects(
    () =>
      prepareOwnedMorarRegistration({
        persistIntent: async () => ({ ok: false, conflict: true }),
        ensureAgency: async () => {
          agencyCreated = true;
          return { status: "created" };
        },
      }),
    /não foi persistida/,
  );
  assert.equal(agencyCreated, false);
});

test("falha ou responsável ausente no agenciamento mantém conclusão pendente", async () => {
  await assert.rejects(
    () =>
      prepareOwnedMorarRegistration({
        persistIntent: async () => ({ ok: true, active: false }),
        ensureAgency: async () => ({ status: "skipped", reason: "Imóvel sem corretor definido." }),
      }),
    /sem corretor/,
  );
  await assert.rejects(
    () =>
      prepareOwnedMorarRegistration({
        persistIntent: async () => ({ ok: true, active: false }),
        ensureAgency: async () => {
          throw new Error("Falha de persistência");
        },
      }),
    /Falha de persistência/,
  );
});

test("repetição aproveita agenciamento existente e não transforma pendência de revisão em publicação", async () => {
  const result = await prepareOwnedMorarRegistration({
    persistIntent: async () => ({
      ok: true,
      state: "draft",
      active: false,
      pendingReview: true,
      reason: "authorization_review",
    }),
    ensureAgency: async () => ({ status: "exists", id: "same-agency" }),
  });
  assert.equal(result.agency.id, "same-agency");
  assert.equal(result.decision.pendingReview, true);
  assert.equal(result.decision.active, false);
});

test("worker próprio despacha somente o hook fixo pelo cofre e falhas não interrompem o cadastro", async (t) => {
  const outboundFetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Credenciais não podem ser enviadas por fetch do pedido.");
  });
  const calls: unknown[] = [];
  for (const outcome of ["success", "sql-error", "transport-error"] as const) {
    await assert.doesNotReject(() =>
      kickOwnedMorarImageWorker({
        rpc: async (name, args) => {
          calls.push({ name, args });
          if (outcome === "transport-error") throw new Error("Dispatcher unavailable");
          return outcome === "sql-error"
            ? { data: null, error: { code: "42883" } }
            : { data: 42, error: null };
        },
      }),
    );
  }
  assert.deepEqual(
    calls,
    Array.from({ length: 3 }, () => ({
      name: "property_worker_dispatch",
      args: { _hook: "property-image-worker", _body: { limit: 2 } },
    })),
  );
  assert.equal(outboundFetch.mock.callCount(), 0);
  const source = readFileSync(
    new URL("../../src/lib/morar-site/image-worker.server.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /getRequest|workerCallerSecret|request\.url|\bfetch\s*\(/);
});
