import { describe, expect, it } from "vitest";
import { requestOwnedPublication } from "./owned-publication.server";
import { imobiDisabledResponse, imobiIntegrationEnabled } from "@/lib/imobibrasil/integration-switch";

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
    expect(imobiIntegrationEnabled()).toBe(false);
    const body = await imobiDisabledResponse("sync").json();
    expect(body).toMatchObject({ disabled: true, reason: "imobi_off", claimed: 0 });
  });

  it("cada marca usa só o seu canal próprio", async () => {
    const admin = fakeAdmin({
      cordial_site_request_publication: { data: { ok: true, state: "published", active: true } },
      morar_site_request_publication: { data: { ok: true, state: "draft", pendingReview: true } },
    });
    const out = await requestOwnedPublication(admin, {
      propertyId: "p1", userId: "u1", brands: ["cordial", "morar", "cordial"], publish: true,
    });
    expect(admin.calls.map((c) => c.fn)).toEqual(["cordial_site_request_publication", "morar_site_request_publication"]);
    expect(admin.calls.some((c) => /imobi|provider|property_publication/.test(c.fn))).toBe(false);
    expect(out.map((r) => [r.brand, r.state])).toEqual([["cordial", "published"], ["morar", "draft"]]);
  });

  it("falta de permissão em uma marca não afeta a outra", async () => {
    const admin = fakeAdmin({
      cordial_site_request_publication: { error: { message: "Forbidden Cordial scope" } },
      morar_site_request_publication: { data: { ok: true, state: "withdrawn" } },
    });
    const out = await requestOwnedPublication(admin, {
      propertyId: "p1", userId: "u1", brands: ["cordial", "morar"], publish: false,
    });
    expect(out[0]).toMatchObject({ brand: "cordial", ok: false });
    expect(out[1]).toMatchObject({ brand: "morar", ok: true, state: "withdrawn" });
    expect(admin.calls[1].args._publish).toBe(false);
  });

  it("conflito de revisão volta como não aplicado", async () => {
    const admin = fakeAdmin({ cordial_site_request_publication: { data: { ok: false, conflict: true } } });
    const [r] = await requestOwnedPublication(admin, {
      propertyId: "p1", userId: "u1", brands: ["cordial"], publish: true, expectedRevision: 3,
    });
    expect(r).toMatchObject({ ok: false, conflict: true });
    expect(admin.calls[0].args._expected_revision).toBe(3);
  });
});
