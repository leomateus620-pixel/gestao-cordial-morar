import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  metaWebhookChallenge,
  receiveMetaWebhook,
  validateMetaSignature,
  MAX_META_WEBHOOK_BYTES,
} from "../../src/lib/ads/leadgen.webhook.server";
import { leadRetryPolicy, mapMetaLeadFields } from "../../src/lib/ads/leadgen.fields";

const app = { appId: "123", appSecret: "test-app-secret", verifyToken: "verify-test" };
const envelope = {
  object: "page",
  entry: [
    {
      id: "456",
      changes: [
        { field: "leadgen", value: { leadgen_id: "789", form_id: "111" } },
        { field: "leadgen", value: { leadgen_id: "790", adgroup_id: "999" } },
      ],
    },
    {
      id: "457",
      changes: [
        { field: "feed", value: {} },
        { field: "leadgen", value: { leadgen_id: "791", created_time: 1793000000 } },
      ],
    },
  ],
};
const raw = JSON.stringify(envelope);
const signed = (body: string, secret = app.appSecret) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
const request = (body = raw, sig: string | null = signed(body)) =>
  new Request("https://example.test/api/public/meta/leadgen", {
    method: "POST",
    body,
    headers: sig ? { "x-hub-signature-256": sig } : {},
  });

test("challenge é exato; modo/token incorretos são rejeitados e ausência é 503", async () => {
  const query =
    "https://example.test/?hub.mode=subscribe&hub.verify_token=verify-test&hub.challenge=000123";
  assert.equal(await metaWebhookChallenge(new Request(query), [app]).text(), "000123");
  assert.equal(
    metaWebhookChallenge(new Request(query.replace("verify-test", "wrong")), [app]).status,
    403,
  );
  assert.equal(
    metaWebhookChallenge(new Request(query.replace("subscribe", "other")), [app]).status,
    403,
  );
  assert.equal(metaWebhookChallenge(new Request(query), []).status, 503);
});
test("verifica bytes originais, assinatura ausente/incorreta e adulteração", async () => {
  const bytes = new TextEncoder().encode(raw);
  assert.equal(validateMetaSignature(bytes, signed(raw), app.appSecret), true);
  assert.equal(validateMetaSignature(bytes, "sha256=00", app.appSecret), false);
  assert.equal(
    (await receiveMetaWebhook(request(raw, null), [app], async () => assert.fail())).status,
    403,
  );
  assert.equal(
    (await receiveMetaWebhook(request(raw + " ", signed(raw)), [app], async () => assert.fail()))
      .status,
    403,
  );
});
test("persiste todos os entries/changes antes do ACK e falha de banco nunca gera 200", async () => {
  let persisted = false;
  const response = await receiveMetaWebhook(request(), [app], async (appId, events) => {
    assert.equal(appId, "123");
    assert.equal(events.length, 3);
    assert.equal(events[1].ad_id, undefined);
    assert.equal(events[1].adset_id, undefined);
    assert.equal(events[1].form_id, undefined);
    await Promise.resolve();
    persisted = true;
  });
  assert.equal(response.status, 200);
  assert.equal(persisted, true);
  assert.equal(
    (
      await receiveMetaWebhook(request(), [app], async () => {
        throw new Error("db");
      })
    ).status,
    503,
  );
});
test("JSON inválido, Página adulterada e corpos acima do limite não persistem", async () => {
  assert.equal(
    (await receiveMetaWebhook(request("{"), [app], async () => assert.fail())).status,
    400,
  );
  const mismatch = JSON.stringify({
    object: "page",
    entry: [
      { id: "456", changes: [{ field: "leadgen", value: { leadgen_id: "789", page_id: "999" } }] },
    ],
  });
  assert.equal(
    (await receiveMetaWebhook(request(mismatch), [app], async () => assert.fail())).status,
    400,
  );
  const huge = "x".repeat(MAX_META_WEBHOOK_BYTES + 1);
  assert.equal(
    (await receiveMetaWebhook(request(huge), [app], async () => assert.fail())).status,
    413,
  );
});
test("mapeamento preserva internacional e campos originais sem inventar interesse", () => {
  const result = mapMetaLeadFields([
    { name: "full_name", values: ["Ana"] },
    { name: "phone_number", values: ["+1 (415) 555-1234"] },
    { name: "pergunta", values: ["Casa no centro"] },
  ]);
  assert.equal(result.phone, "+14155551234");
  assert.equal(result.interest, null);
  assert.equal(result.field_data[2].values[0], "Casa no centro");
  assert.equal(mapMetaLeadFields([], {}).full_name, null);
  assert.equal(
    mapMetaLeadFields([{ name: "pergunta", values: ["Casa"] }], { interest: "pergunta" }).interest,
    "Casa",
  );
});
test("revogação e permissão não repetem; transitórios têm backoff limitado e jitter", () => {
  assert.equal(leadRetryPolicy("token_expired", 1).terminal, true);
  assert.equal(leadRetryPolicy("no_permission", 1).terminal, true);
  assert.equal(leadRetryPolicy("provider_error", 8).terminal, true);
  assert.equal(leadRetryPolicy("rate_limited", 1, 0).terminal, false);
  assert.ok(
    leadRetryPolicy("rate_limited", 4, 1).delaySeconds >
      leadRetryPolicy("rate_limited", 1, 0).delaySeconds,
  );
});
