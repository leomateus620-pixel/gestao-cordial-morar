import assert from "node:assert/strict";
import { test } from "node:test";
import {
  audienceHostSettings,
  audienceRequestIp,
  audienceRateKey,
  audienceSettings,
  classifyAudienceAttribution,
  makeAudienceFormProof,
  verifyAudienceFormProof,
} from "../../src/lib/site-audience/privacy.server";

const production = {
  SITE_AUDIENCE_ENV: "production",
  SITE_AUDIENCE_INGRESS_VERIFIED: "true",
  SITE_AUDIENCE_RATE_SECRET: "private-audience-test-secret".repeat(2),
  CORDIAL_SITE_ENV: "production",
  MORAR_SITE_ENV: "production",
  CORDIAL_SITE_AUDIENCE_POLICY_VERSION: "v1",
  MORAR_SITE_AUDIENCE_POLICY_VERSION: "v1",
  CORDIAL_SITE_AUDIENCE_UTM_PAIRS: "qa:cpc,lista:email,wrong,space included:cpc",
  CORDIAL_SITE_AUDIENCE_CAMPAIGNS: "outono,Nome Sobrenome",
  CORDIAL_SITE_AUDIENCE_REFERRERS: "parceiro.com.br,https://ignored.example",
};
const qa = {
  ...production,
  SITE_AUDIENCE_ENV: "qa",
  SITE_AUDIENCE_LOCAL_QA: "true",
  CORDIAL_SITE_ENV: "preview",
  MORAR_SITE_ENV: "preview",
  VITE_CORDIAL_SITE_PUBLIC_HOST: "cordial.localhost:5198",
  VITE_MORAR_SITE_PUBLIC_HOST: "morar.localhost:5198",
  CORDIAL_SITE_AUDIENCE_QA_HOST: "cordial.localhost:5198",
  MORAR_SITE_AUDIENCE_QA_HOST: "morar.localhost:5198",
};

test("configured host, inbound origin category and environment are isolated", () => {
  const request = (url: string) => new Request(url);
  const expected = "https://cordialimoveis.com/api/cordial-site/audience";
  assert.equal(audienceHostSettings(request(expected), "cordial", {})?.environment, undefined);
  assert.equal(
    audienceHostSettings(request(expected), "cordial", production)?.environment,
    "production",
  );
  assert.equal(audienceHostSettings(request(expected), "morar", production), null);
  assert.equal(audienceHostSettings(request(expected), "cordial", qa), null);
  for (const origin of [
    "https://www.cordialimoveis.com",
    "https://cordialgestao.com",
    "https://imobiliariamorarimoveis.com.br",
    "http://cordialimoveis.com",
  ]) {
    assert.equal(
      audienceHostSettings(request(`${origin}/api/cordial-site/audience`), "cordial", production),
      null,
    );
  }
  const dedicated = request("http://cordial.localhost:5198/api/cordial-site/audience");
  assert.equal(audienceHostSettings(dedicated, "cordial", qa)?.environment, "qa");
  assert.equal(
    audienceHostSettings(dedicated, "cordial", { ...qa, SITE_AUDIENCE_LOCAL_QA: "" }),
    null,
  );
  assert.equal(
    audienceHostSettings(dedicated, "cordial", {
      ...qa,
      MORAR_SITE_AUDIENCE_QA_HOST: "cordial.localhost:5198",
    }),
    null,
  );
  assert.equal(
    audienceHostSettings(request(expected + "?tracking=discarded"), "cordial", production),
    null,
  );

  const headers = { "cf-connecting-ip": "198.51.100.3", "user-agent": "Mozilla/5.0" };
  assert.equal(
    audienceRequestIp(new Request(expected, { headers }), "production", production),
    "198.51.100.3",
  );
  assert.equal(
    audienceRequestIp(new Request(expected, { headers }), "production", {
      ...production,
      SITE_AUDIENCE_INTERNAL_IPS: "198.51.100.3",
    }),
    null,
  );
  assert.equal(
    audienceRequestIp(
      new Request(expected, {
        headers: { ...headers, "user-agent": "Example Bot" },
      }),
      "production",
      production,
    ),
    null,
  );
});

test("origin attribution persists only controlled campaign values and domains", () => {
  const settings = audienceSettings("cordial", production);
  assert.ok(settings);
  const attribution = (input?: Parameters<typeof classifyAudienceAttribution>[0]) =>
    classifyAudienceAttribution(input, settings);
  assert.deepEqual(
    attribution({
      source: "qa",
      medium: "cpc",
      campaign: "outono",
      referrerDomain: "google.com.br",
    }),
    { channel: "paid", source: "qa", medium: "cpc", campaign: "outono" },
  );
  assert.deepEqual(attribution({ source: "qa", medium: "cpc", campaign: "unapproved" }), {
    channel: "paid",
    source: "qa",
    medium: "cpc",
    campaign: null,
  });
  assert.deepEqual(
    attribution({ source: "unapproved", medium: "cpc", referrerDomain: "www.google.com.br" }),
    { channel: "organic", source: "google", medium: "organic", campaign: null },
  );
  assert.deepEqual(attribution({ referrerDomain: "private-label.parceiro.com.br" }), {
    channel: "referral",
    source: "parceiro.com.br",
    medium: "referral",
    campaign: null,
  });
  assert.deepEqual(attribution({ referrerDomain: "private.example.org" }), {
    channel: "referral",
    source: null,
    medium: "referral",
    campaign: null,
  });
  assert.deepEqual(attribution({ referrerDomain: "cordialimoveis.com" }), attribution());
});

test("confirmed form proofs are short-lived, one-key per request, and bound to the brand and property", async () => {
  const settings = audienceSettings("cordial", production);
  const morar = audienceSettings("morar", production);
  const qaSettings = audienceSettings("cordial", qa);
  assert.ok(settings && morar && qaSettings);
  const now = Date.parse("2026-11-26T15:00:00Z");
  const form = "00000000-0000-0000-0000-00000000000a";
  const propertyId = "00000000-0000-0000-0000-00000000000b";
  const first = await makeAudienceFormProof(settings, form, propertyId, now);
  const second = await makeAudienceFormProof(settings, form, propertyId, now + 2000);
  const accepted = await verifyAudienceFormProof(settings, first, propertyId, now);
  assert.ok(accepted);
  assert.notEqual(accepted, form);
  assert.equal(await verifyAudienceFormProof(settings, second, propertyId, now), accepted);
  assert.equal(await verifyAudienceFormProof(settings, first, propertyId, now + 301000), null);
  assert.equal(await verifyAudienceFormProof(settings, first, undefined, now), null);
  assert.equal(await verifyAudienceFormProof(morar, first, propertyId, now), null);
  assert.equal(await verifyAudienceFormProof(qaSettings, first, propertyId, now), null);
  assert.equal(
    await verifyAudienceFormProof(
      settings,
      first.replace(/\.[0-9a-f]+$/, "." + "0".repeat(64)),
      propertyId,
      now,
    ),
    null,
  );
  const rate1 = await audienceRateKey(settings, "198.51.100.3", now);
  assert.equal(rate1, await audienceRateKey(settings, "198.51.100.3", now + 1000));
  assert.notEqual(rate1, await audienceRateKey(settings, "198.51.100.3", now + 900000));
  assert.notEqual(rate1, await audienceRateKey(morar, "198.51.100.3", now));
  assert.notEqual(rate1, await audienceRateKey(qaSettings, "198.51.100.3", now));
});
