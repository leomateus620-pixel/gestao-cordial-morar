import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";
import {
  activateAudience,
  audienceStorageKeys,
  clearAudienceIdentity,
  measureAudienceAction,
  prepareAudienceForm,
  writeAudiencePreference,
} from "../../src/lib/site-audience/client";
import { audienceBatchSchema, type AudienceBatch } from "../../src/lib/site-audience/contract";
import {
  audienceAttribution,
  siteAudienceMenu,
  siteAudiencePage,
} from "../../src/lib/site-audience/navigation";

const config = {
  enabled: true as const,
  policyVersion: "qa-v1",
  pairs: [{ source: "newsletter", medium: "email" }],
  campaigns: ["campanha-qa"],
};
const a = "10101010-1010-1010-1010-101010101010";
const b = "20202020-2020-2020-2020-202020202020";
const proof = `${b}.1767657600000.${"a".repeat(64)}`;

test("normalizes only recognized public page/menu dimensions", () => {
  assert.equal(siteAudiencePage("/site", undefined, "cordial"), "home");
  assert.equal(siteAudiencePage("/site-morar/buscar", "venda", "morar"), "buy");
  assert.equal(siteAudiencePage("/site-morar/buscar/", "aluguel", "morar"), "rent");
  assert.equal(siteAudiencePage("/site-morar/buscar", "email@example.com", "morar"), "search");
  assert.equal(
    siteAudiencePage("/site/noticias/private-looking-slug", undefined, "cordial"),
    "news",
  );
  assert.equal(siteAudiencePage("/site/imovel/imovel-a-example", undefined, "cordial"), "property");
  assert.equal(siteAudiencePage("/site/selecao/private-token", undefined, "cordial"), "selection");
  assert.equal(siteAudiencePage("/site-morar/buscar", "venda", "cordial"), null);
  assert.equal(siteAudienceMenu("/site/imovel/example", new URLSearchParams(), "cordial"), null);
});

test("uses only explicitly approved UTM values and avoids internal/full referrers", () => {
  const page = new URL(
    "https://cordialimoveis.com/?utm_source=Newsletter&utm_medium=email&utm_campaign=campanha-qa",
  );
  assert.deepEqual(
    audienceAttribution(page, "https://www.google.com/search?q=secret", "cordial", config),
    {
      source: "newsletter",
      medium: "email",
      campaign: "campanha-qa",
      referrerDomain: "google.com",
    },
  );
  page.searchParams.set("utm_campaign", "jose");
  assert.deepEqual(
    audienceAttribution(page, "https://www.cordialimoveis.com/secret", "cordial", config),
    {
      source: "newsletter",
      medium: "email",
    },
  );
  page.searchParams.append("utm_medium", "email");
  assert.deepEqual(
    audienceAttribution(page, "https://local.internal/private", "cordial", config),
    undefined,
  );
});

test("consented journey has ordered, brand-scoped events, reload and expiry semantics", async (t) => {
  const browser = new Window({
    url: "https://cordialimoveis.com/?utm_source=newsletter&utm_medium=email&utm_campaign=campanha-qa",
  });
  const sent: Array<{ endpoint: unknown; batch: AudienceBatch }> = [];
  let clock = 1_000_000;
  let navigation: "navigate" | "reload" = "navigate";
  let responseStatus = 204;
  const globals = {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    localStorage: browser.localStorage,
    performance: {
      now: () => 5000,
      getEntriesByType: () => [{ name: browser.location.href, type: navigation }],
    },
    fetch: async (endpoint: unknown, options: RequestInit) => {
      assert.equal(options.referrerPolicy, "no-referrer");
      assert.equal(options.credentials, "omit");
      assert.equal(
        new Headers(options.headers).get("X-Site-Audience-Policy"),
        config.policyVersion,
      );
      sent.push({ endpoint, batch: audienceBatchSchema.parse(JSON.parse(String(options.body))) });
      return new Response(null, { status: responseStatus });
    },
  };
  const old = new Map(
    Object.entries(globals).map(([key]) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  t.mock.method(Date, "now", () => clock);
  let controller = activateAudience("cordial", config, () => {});
  t.after(async () => {
    controller.stop();
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    await browser.close();
  });
  const identityKey = audienceStorageKeys("cordial").identity;
  const leave = () => browser.dispatchEvent(new browser.Event("pagehide"));

  controller.updateView({ page: "home" });
  measureAudienceAction("cordial", { kind: "menu_click", menu: "buy" });
  leave();
  assert.equal(browser.localStorage.getItem(identityKey), null);
  assert.equal(prepareAudienceForm("cordial"), null);
  assert.equal(sent.length, 0);
  controller.stop();

  writeAudiencePreference("cordial", { policyVersion: config.policyVersion, choice: "granted" });
  controller = activateAudience("cordial", config, () => {});
  controller.updateView({ page: "home" });
  controller.updateView({ page: "home" });
  measureAudienceAction("cordial", { kind: "menu_click", menu: "buy", placement: "header" });
  controller.updateView({ page: "buy" });
  measureAudienceAction("cordial", { kind: "quick_view", propertyId: a, placement: "card" });
  measureAudienceAction("cordial", { kind: "property_click", propertyId: a, placement: "card" });
  controller.updateView({ page: "property", propertyId: a });
  measureAudienceAction("cordial", {
    kind: "property_click",
    propertyId: b,
    placement: "recommendations",
  });
  controller.updateView({ page: "property", propertyId: b });
  measureAudienceAction("cordial", {
    kind: "property_click",
    propertyId: a,
    placement: "recommendations",
  });
  controller.updateView({ page: "property", propertyId: a });
  measureAudienceAction("cordial", { kind: "whatsapp_click", propertyId: a, placement: "detail" });
  prepareAudienceForm("cordial")?.record(proof, a);
  measureAudienceAction("morar", { kind: "menu_click", menu: "buy" });
  leave();
  assert.equal(sent.length, 1);
  const first = sent[0].batch;
  assert.equal(sent[0].endpoint, "/api/cordial-site/audience");
  assert.deepEqual(
    first.events.map((event) => event.kind),
    [
      "session_start",
      "page_view",
      "menu_click",
      "page_view",
      "quick_view",
      "property_click",
      "page_view",
      "property_view",
      "property_click",
      "page_view",
      "property_view",
      "property_click",
      "page_view",
      "property_view",
      "whatsapp_click",
      "form_received",
    ],
  );
  assert.deepEqual(first.events[0], {
    kind: "session_start",
    id: first.events[0].id,
    page: "home",
    measurableActivity: false,
    attribution: { source: "newsletter", medium: "email", campaign: "campanha-qa" },
  });
  assert.equal(browser.localStorage.getItem(audienceStorageKeys("morar").identity), null);

  controller.stop();
  navigation = "reload";
  browser.location.href = `https://cordialimoveis.com/imovel/a-${a}`;
  controller = activateAudience("cordial", config, () => {});
  controller.updateView({ page: "property", propertyId: a });
  leave();
  const reload = sent[1].batch;
  assert.equal(reload.visitorId, first.visitorId);
  assert.equal(reload.sessionId, first.sessionId);
  assert.deepEqual(
    reload.events.map((event) => event.kind),
    ["page_view", "property_view"],
  );
  const view = reload.events[1];
  assert.equal(view.kind === "property_view" && view.navigation, "reload");

  clock += 30 * 60_000;
  measureAudienceAction("cordial", { kind: "whatsapp_click", propertyId: a });
  leave();
  assert.equal(sent[2].batch.visitorId, first.visitorId);
  assert.notEqual(sent[2].batch.sessionId, first.sessionId);
  assert.equal(sent[2].batch.events[0].kind, "session_start");

  const delayedForm = prepareAudienceForm("cordial");
  writeAudiencePreference("cordial", { policyVersion: config.policyVersion, choice: "denied" });
  controller.stop();
  clearAudienceIdentity("cordial");
  delayedForm?.record(proof, a);
  leave();
  assert.equal(sent.length, 3);
  assert.equal(browser.localStorage.getItem(identityKey), null);

  responseStatus = 503;
  writeAudiencePreference("cordial", { policyVersion: config.policyVersion, choice: "granted" });
  controller = activateAudience("cordial", config, () => {});
  controller.updateView({ page: "home" });
  leave();
  await Promise.resolve();
  assert.equal(sent[3].batch.events[0].kind, "session_start");
  assert.equal(JSON.parse(browser.localStorage.getItem(identityKey)!).lastActivity, -1);
  measureAudienceAction("cordial", { kind: "menu_click", menu: "buy" });
  leave();
  assert.equal(sent.length, 4);

  clock += 5000;
  responseStatus = 204;
  measureAudienceAction("cordial", { kind: "menu_click", menu: "buy" });
  leave();
  assert.equal(sent[4].batch.events[0].kind, "session_start");
  assert.notEqual(sent[4].batch.sessionId, sent[3].batch.sessionId);
  assert.equal(sent[4].batch.visitorId, sent[3].batch.visitorId);
});
