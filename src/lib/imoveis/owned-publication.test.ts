import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requestOwnedPublication } from "./owned-publication.server";
import { imobiDisabledResponse, imobiIntegrationEnabled } from "../imobibrasil/integration-switch";

function fakeAdmin(responses: Record<string, { data?: unknown; error?: { message: string } | null }>) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    rpc: (fn: never, args: never) => {
      calls.push({ fn, args });
      const r = responses[fn] ?? { data: null };
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    },
  };
}

describe("publicação nos sites próprios (Imobi OFF)", () => {
  it("ImobiBrasil fica desligada e as rotinas respondem sem trabalho", async () => {
    assert.equal(imobiIntegrationEnabled(), false);
    const body = await imobiDisabledResponse("sync").json();
    assert.deepEqual([body.disabled, body.reason, body.claimed], [true, "imobi_off", 0]);
  });

  it("cada marca usa só o seu canal próprio", async () => {
    const admin = fakeAdmin({
      cordial_site_request_publication: { data: { ok: true, state: "published", active: true } },
      morar_site_request_publication: { data: { ok: true, state: "draft", pendingReview: true } },
    });
    const out = await requestOwnedPublication(admin, {
      propertyId: "p1", userId: "u1", brands: ["cordial", "morar", "cordial"], publish: true,
    });
    assert.deepEqual(admin.calls.map((c) => c.fn), ["cordial_site_request_publication", "morar_site_request_publication"]);
    assert.equal(admin.calls.some((c) => /imobi|provider|property_publication/.test(c.fn)), false);
    assert.deepEqual(out.map((r) => [r.brand, r.state]), [["cordial", "published"], ["morar", "draft"]]);
  });

  it("falta de permissão em uma marca não afeta a outra", async () => {
    const admin = fakeAdmin({
      cordial_site_request_publication: { error: { message: "Forbidden Cordial scope" } },
      morar_site_request_publication: { data: { ok: true, state: "withdrawn" } },
    });
    const out = await requestOwnedPublication(admin, {
      propertyId: "p1", userId: "u1", brands: ["cordial", "morar"], publish: false,
    });
    assert.deepEqual([out[0].brand, out[0].ok], ["cordial", false]);
    assert.deepEqual([out[1].brand, out[1].ok, out[1].state], ["morar", true, "withdrawn"]);
    assert.equal(admin.calls[1].args._publish, false);
  });

  it("conflito de revisão volta como não aplicado", async () => {
    const admin = fakeAdmin({ cordial_site_request_publication: { data: { ok: false, conflict: true } } });
    const [r] = await requestOwnedPublication(admin, {
      propertyId: "p1", userId: "u1", brands: ["cordial"], publish: true, expectedRevision: 3,
    });
    assert.deepEqual([r.ok, r.conflict], [false, true]);
    assert.equal(admin.calls[0].args._expected_revision, 3);
  });
});

describe("falha parcial e clique repetido", () => {
  it("uma marca falha e a outra é salva: resultado mostra a falha, sem sucesso geral", async () => {
    const admin = fakeAdmin({
      cordial_site_request_publication: { data: { ok: true, state: "published" } },
      morar_site_request_publication: { error: { message: "Forbidden Morar scope" } },
    });
    const out = await requestOwnedPublication(admin, {
      propertyId: "p1", userId: "u1", brands: ["cordial", "morar"], publish: true, expectedRevision: 7,
    });
    assert.deepEqual(out.map((r) => [r.brand, r.ok]), [["cordial", true], ["morar", false]]);
    assert.equal(admin.calls.every((c) => c.args._expected_revision === 7), true);
  });

  it("clique repetido devolve o estado completo, não só 'unchanged'", async () => {
    const admin = fakeAdmin({
      cordial_site_request_publication: {
        data: { ok: true, unchanged: true, state: "withdrawn", decision: "publish", blockReason: "Falta autorização do proprietário" },
      },
    });
    const [r] = await requestOwnedPublication(admin, { propertyId: "p1", userId: "u1", brands: ["cordial"], publish: true });
    assert.equal(r.state, "withdrawn");
    assert.equal(r.blockReason, "Falta autorização do proprietário");
  });
});
