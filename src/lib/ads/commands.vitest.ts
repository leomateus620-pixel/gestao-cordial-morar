import { describe, expect, it } from "vitest";
import {
  creationStepPayload,
  metaAdDraftInputSchema,
  metaAdDraftPayloadSchema,
  type MetaAdCommand,
  type MetaAdDraftPayload,
  type MetaAdStep,
  type MetaCommandStep,
} from "./drafts.model";
import { runPausedCreation, type MetaCreationPort } from "./commands.engine";
import { assertHierarchyScope, hierarchyRevision } from "./hierarchy.server";
import { validateMetaImage } from "./drafts.media";
const payload: MetaAdDraftPayload = {
  name: "Imóvel demonstração sintética",
  destination: "website",
  websiteUrl: "https://example.test/imovel",
  pageId: "123",
  country: "BR",
  housingConfirmed: true,
  budget: {
    kind: "daily",
    amountMinor: "2500",
    currency: "BRL",
    startTime: "2026-11-01T09:00:00-03:00",
  },
  creative: {
    imageHash: "abcdef123456",
    title: "Conheça o imóvel",
    message: "Conteúdo sintético de teste",
    callToAction: "LEARN_MORE",
  },
};
function harness(initial: MetaAdCommand["steps"] = {}) {
  const history: string[] = [],
    steps = structuredClone(initial);
  let result: string | undefined,
    count = 0;
  const port: MetaCreationPort = {
    async record(step, value) {
      history.push(`persist:${step}:${value.state}`);
      steps[step] = value;
    },
    async create(step, fields) {
      history.push(`POST:${step}`);
      expect(fields.status ?? "PAUSED").toBe("PAUSED");
      return { id: String(++count + 100) };
    },
    async verify(step, id) {
      history.push(`GET:${step}`);
      return { id, account_id: "99", status: "PAUSED" };
    },
    async finish(state) {
      result = state;
    },
  };
  return { port, history, steps, result: () => result };
}
describe("Meta external command contract (simulated)", () => {
  it("saves incomplete drafts but requires complete payload at submission", () => {
    expect(metaAdDraftInputSchema.parse({ name: "Parcial", budget: { kind: "daily" } }).name).toBe(
      "Parcial",
    );
    expect(metaAdDraftPayloadSchema.safeParse({ name: "Parcial" }).success).toBe(false);
    expect(
      metaAdDraftPayloadSchema.safeParse({
        ...payload,
        budget: { ...payload.budget, kind: "lifetime" },
      }).success,
    ).toBe(false);
    expect(
      metaAdDraftPayloadSchema.safeParse({ ...payload, destination: "lead_form" }).success,
    ).toBe(false);
  });
  it("always declares HOUSING and fixes allowed BR broad targeting without age/gender workaround", () => {
    expect(creationStepPayload("campaign", payload, "cmd", {}).special_ad_categories).toBe(
      '["HOUSING"]',
    );
    const targeting = JSON.parse(
      creationStepPayload("adset", payload, "cmd", { campaign: "1" }).targeting,
    );
    expect(targeting.geo_locations.countries).toEqual(["BR"]);
    expect(targeting.age_min).toBeUndefined();
    expect(targeting.genders).toBeUndefined();
    expect(() => creationStepPayload("ad", payload, "cmd", {})).toThrow();
    expect(
      metaAdDraftPayloadSchema.safeParse({
        ...payload,
        budget: { ...payload.budget, currency: "JPY" },
      }).success,
    ).toBe(false);
    expect(
      metaAdDraftPayloadSchema.safeParse({ ...payload, arbitraryGraphParameter: true }).success,
    ).toBe(false);
  });
  it("persists intention before POST and external ID before confirmation GET, then each dependency", async () => {
    const h = harness();
    await runPausedCreation({ id: "cmd", steps: {} }, payload, h.port);
    expect(h.result()).toBe("done");
    expect(h.history.slice(0, 5)).toEqual([
      "persist:campaign:sending",
      "POST:campaign",
      "persist:campaign:uncertain",
      "GET:campaign",
      "persist:campaign:done",
    ]);
    expect(h.history.filter((row) => row.startsWith("POST"))).toHaveLength(4);
    expect(Object.values(h.steps).every((step) => step?.state === "done")).toBe(true);
  });
  it("timeout is uncertain and neither same command nor recovered process repeats the POST", async () => {
    const h = harness();
    h.port.create = async () => {
      throw Object.assign(new Error("transport"), { code: "outcome_uncertain" });
    };
    await runPausedCreation({ id: "cmd", steps: {} }, payload, h.port);
    expect(h.result()).toBe("uncertain");
    expect(h.steps.campaign?.state).toBe("uncertain");
    const resumed = harness(h.steps);
    await runPausedCreation({ id: "cmd", steps: h.steps }, payload, resumed.port);
    expect(resumed.history).toHaveLength(0);
    expect(resumed.result()).toBe("uncertain");
  });
  it("known ID survives verification failure and replay cannot create another asset", async () => {
    const h = harness();
    h.port.verify = async () => {
      throw new Error("read timeout");
    };
    await runPausedCreation({ id: "cmd", steps: {} }, payload, h.port);
    expect(h.steps.campaign).toMatchObject({
      state: "uncertain",
      id: "101",
      error: "verification_pending",
    });
  });
  it("definitive failed adset retains campaign and explicit resume skips confirmed IDs", async () => {
    const h = harness();
    const create = h.port.create;
    h.port.create = async (step, fields) => {
      if (step === "adset") throw Object.assign(new Error(), { code: "invalid_parameter" });
      return create(step, fields);
    };
    await runPausedCreation({ id: "cmd", steps: {} }, payload, h.port);
    expect(h.result()).toBe("partial");
    expect(h.steps.campaign?.id).toBe("101");
    const resumed = harness(h.steps);
    await runPausedCreation({ id: "cmd", steps: h.steps }, payload, resumed.port);
    expect(resumed.history).not.toContain("POST:campaign");
    expect(resumed.result()).toBe("done");
  });
  it("a persistence failure before the POST makes no external call", async () => {
    const h = harness();
    h.port.record = async () => {
      throw new Error("database unavailable");
    };
    await expect(runPausedCreation({ id: "cmd", steps: {} }, payload, h.port)).rejects.toThrow();
    expect(h.history).toHaveLength(0);
  });
  it("connection/account/page/parent mismatch cannot be silently accepted", () => {
    expect(() =>
      assertHierarchyScope(
        { id: "1", account_id: "wrong" },
        { account_id: "99", page_id: "123" },
        "campaign",
        {},
      ),
    ).toThrow();
    expect(() =>
      assertHierarchyScope(
        { id: "2", account_id: "99", campaign_id: "666" },
        { account_id: "99", page_id: "123" },
        "adset",
        { campaign: "1" },
      ),
    ).toThrow();
    expect(() =>
      assertHierarchyScope(
        { id: "2", account_id: "99", object_story_spec: { page_id: "456" } },
        { account_id: "99", page_id: "123" },
        "creative",
        {},
      ),
    ).toThrow();
    expect(hierarchyRevision({ id: "1", status: "PAUSED", effective_status: "IN_PROCESS" })).toBe(
      hierarchyRevision({ status: "PAUSED", id: "1", effective_status: "DISAPPROVED" }),
    );
    expect(hierarchyRevision({ id: "1", daily_budget: "2500" })).not.toBe(
      hierarchyRevision({ id: "1", daily_budget: "2501" }),
    );
  });
  it("validates bytes, dimensions, ratio and size before any upload", () => {
    const png = new Uint8Array(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    png.set([73, 72, 68, 82], 12);
    const view = new DataView(png.buffer);
    view.setUint32(16, 1080);
    view.setUint32(20, 1080);
    expect(validateMetaImage(png)).toEqual({ mime: "image/png", width: 1080, height: 1080 });
    expect(() => validateMetaImage(new Uint8Array(5 * 1024 * 1024 + 1))).toThrow();
    view.setUint32(20, 1);
    expect(() => validateMetaImage(png)).toThrow();
    expect(() => validateMetaImage(new TextEncoder().encode('<svg onload="x"/>'))).toThrow();
  });
});
