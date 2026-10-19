import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANALYTICS_CONSENT_KEY,
  analyticsPageLocation,
  createAnalyticsStorageListener,
  readAnalyticsConsent,
  updateAnalyticsConsent,
  type AnalyticsConsent,
  type AnalyticsRuntime,
} from "../../src/lib/cordial-site/analytics-consent";

const measurementId = "G-CORDIALTEST";
const disabledKey = `ga-disable-${measurementId}`;
const deniedStorage = {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
};

test("manual metrics redact shared-link capabilities and never carry queries or fragments", () => {
  const origin = "https://cordialgestao.com";
  assert.equal(
    analyticsPageLocation(origin, "/site/selecao/private-read-token?email=private#foto-3"),
    `${origin}/site/selecao/compartilhada`,
  );
  assert.equal(
    analyticsPageLocation(origin, "/selecao/private-read-token"),
    `${origin}/selecao/compartilhada`,
  );
  assert.equal(analyticsPageLocation(origin, "/s/private-read-token"), `${origin}/s/compartilhada`);
  assert.equal(
    analyticsPageLocation(origin, "/site/buscar?telefone=private#filter"),
    `${origin}/site/buscar`,
  );
  assert.equal(
    analyticsPageLocation(origin, "/site/imovel/public-id"),
    `${origin}/site/imovel/public-id`,
  );
  assert.equal(analyticsPageLocation("invalid", "/site"), "");
});

// Model an SDK that has already executed. Removing its script or a queue does not
// remove this function, so revocation must also stop its subsequent event sends.
function executedSdk() {
  const calls: unknown[][] = [];
  const sent: unknown[][] = [];
  const runtime: AnalyticsRuntime = {};
  const sdk = (...args: unknown[]) => {
    calls.push(args);
    if (args[0] === "event" && runtime[disabledKey] !== true) sent.push(args);
  };
  runtime.gtag = sdk;
  return {
    runtime,
    sdk,
    calls,
    sent,
    emit: () => sdk("event", "property_open", { property_reference: "TEST-471" }),
    consentCalls: () => calls.filter(([command]) => command === "consent"),
  };
}

test("revoking granted consent stops an already executed SDK while its function remains installed", () => {
  const mock = executedSdk();
  assert.equal(updateAnalyticsConsent(mock.runtime, measurementId, "granted"), mock.sdk);
  assert.equal(mock.runtime[disabledKey], false);
  mock.emit();
  assert.equal(mock.sent.length, 1);

  updateAnalyticsConsent(mock.runtime, measurementId, "denied");
  assert.equal(mock.runtime.gtag, mock.sdk, "the test keeps the executed SDK alive");
  assert.equal(mock.runtime[disabledKey], true);
  mock.emit();
  assert.equal(mock.sent.length, 1, "the still-installed SDK must not send after revocation");
  assert.deepEqual(mock.consentCalls().at(-1), ["consent", "update", deniedStorage]);
});

test("denied to granted re-enables the SDK using an update without another default", () => {
  const mock = executedSdk();
  updateAnalyticsConsent(mock.runtime, measurementId, "denied");
  mock.emit();
  assert.equal(mock.sent.length, 0);
  updateAnalyticsConsent(mock.runtime, measurementId, "granted");
  mock.emit();
  assert.equal(mock.sent.length, 1);
  assert.equal(mock.runtime[disabledKey], false);
  assert.deepEqual(mock.consentCalls(), [
    ["consent", "default", deniedStorage],
    ["consent", "update", deniedStorage],
    ["consent", "update", { ...deniedStorage, analytics_storage: "granted" }],
  ]);
});

test("the first grant establishes all-denied defaults before updating analytics only", () => {
  const mock = executedSdk();
  updateAnalyticsConsent(mock.runtime, measurementId, "granted");
  assert.deepEqual(mock.consentCalls(), [
    ["consent", "default", deniedStorage],
    ["consent", "update", { ...deniedStorage, analytics_storage: "granted" }],
  ]);
  const secondRuntime = executedSdk();
  updateAnalyticsConsent(secondRuntime.runtime, measurementId, "granted");
  assert.deepEqual(secondRuntime.consentCalls()[0], ["consent", "default", deniedStorage]);
});

test("denied or unknown consent creates no SDK or queue for a visitor who never granted", () => {
  for (const consent of [null, "denied"] as const) {
    const runtime: AnalyticsRuntime = {};
    assert.equal(updateAnalyticsConsent(runtime, measurementId, consent), undefined);
    assert.equal(runtime[disabledKey], true);
    assert.equal(runtime.gtag, undefined);
    assert.equal(runtime.dataLayer, undefined);
  }
});

test("another tab revokes the executed SDK synchronously before notifying the interface", () => {
  const mock = executedSdk();
  updateAnalyticsConsent(mock.runtime, measurementId, "granted");
  let stored: string | null = "denied";
  const changes: AnalyticsConsent[] = [];
  const onStorage = createAnalyticsStorageListener(
    mock.runtime,
    measurementId,
    { getItem: (key) => (key === ANALYTICS_CONSENT_KEY ? stored : null) },
    (consent) => {
      assert.equal(mock.runtime[disabledKey], true);
      mock.emit();
      changes.push(consent);
    },
  );

  onStorage({ key: ANALYTICS_CONSENT_KEY });
  assert.deepEqual(changes, ["denied"]);
  assert.equal(mock.sent.length, 0);
  assert.deepEqual(mock.consentCalls().at(-1), ["consent", "update", deniedStorage]);

  updateAnalyticsConsent(mock.runtime, measurementId, "granted");
  stored = null;
  onStorage({ key: null });
  assert.deepEqual(changes, ["denied", null], "storage.clear also revokes consent");
  assert.equal(mock.sent.length, 0);
});

test("another tab granting consent leaves the SDK disabled until the interface authorizes configuration", () => {
  const mock = executedSdk();
  updateAnalyticsConsent(mock.runtime, measurementId, "denied");
  const previousCalls = mock.calls.length;
  const changes: AnalyticsConsent[] = [];
  const onStorage = createAnalyticsStorageListener(
    mock.runtime,
    measurementId,
    { getItem: () => "granted" },
    (consent) => {
      assert.equal(mock.runtime[disabledKey], true);
      mock.emit();
      changes.push(consent);
    },
  );

  onStorage({ key: ANALYTICS_CONSENT_KEY });
  assert.deepEqual(changes, ["granted"]);
  assert.equal(mock.sent.length, 0);
  assert.equal(
    mock.calls.length,
    previousCalls + 1,
    "only the attempted event ran, with no SDK consent grant",
  );
  assert.equal(mock.runtime[disabledKey], true);

  // The component may now check the real measurement ID and published policy.
  updateAnalyticsConsent(mock.runtime, measurementId, "granted");
  mock.emit();
  assert.equal(mock.sent.length, 1);
});

test("an SDK throwing during revocation cannot prevent disabling or the storage change callback", () => {
  const mock = executedSdk();
  updateAnalyticsConsent(mock.runtime, measurementId, "granted");
  let rejectedCommands = 0;
  mock.runtime.gtag = () => {
    assert.equal(mock.runtime[disabledKey], true, "disable before consulting the SDK");
    rejectedCommands++;
    throw new Error("SDK rejected the consent command");
  };
  const changes: AnalyticsConsent[] = [];
  const onStorage = createAnalyticsStorageListener(
    mock.runtime,
    measurementId,
    { getItem: () => "denied" },
    (consent) => changes.push(consent),
  );

  assert.doesNotThrow(() => onStorage({ key: ANALYTICS_CONSENT_KEY }));
  assert.equal(rejectedCommands, 1);
  assert.equal(mock.runtime[disabledKey], true);
  assert.deepEqual(changes, ["denied"]);
  mock.emit();
  assert.equal(mock.sent.length, 0);
  assert.doesNotThrow(() => updateAnalyticsConsent(mock.runtime, measurementId, "denied"));
  assert.equal(mock.runtime[disabledKey], true);
});

test("unrelated storage changes do not read consent, touch the SDK or notify the interface", () => {
  const mock = executedSdk();
  let reads = 0;
  let notifications = 0;
  const onStorage = createAnalyticsStorageListener(
    mock.runtime,
    measurementId,
    {
      getItem: () => {
        reads++;
        return "denied";
      },
    },
    () => notifications++,
  );
  onStorage({ key: "cordial:favorites:v1" });
  assert.equal(reads, 0);
  assert.equal(notifications, 0);
  assert.equal(mock.calls.length, 0);
  assert.equal(mock.runtime[disabledKey], undefined);
});

test("consent reads reject invalid values and blocked storage fails closed, including cross-tab changes", () => {
  for (const [stored, expected] of [
    ["granted", "granted"],
    ["denied", "denied"],
    [null, null],
    ["true", null],
    ["GRANTED", null],
    ["", null],
  ] as const) {
    assert.equal(readAnalyticsConsent({ getItem: () => stored }), expected);
  }
  const blockedStorage = {
    getItem: () => {
      throw new Error("Storage is unavailable");
    },
  };
  assert.equal(readAnalyticsConsent(blockedStorage), "denied");
  const mock = executedSdk();
  updateAnalyticsConsent(mock.runtime, measurementId, "granted");
  const changes: AnalyticsConsent[] = [];
  createAnalyticsStorageListener(mock.runtime, measurementId, blockedStorage, (consent) => {
    changes.push(consent);
  })({ key: ANALYTICS_CONSENT_KEY });
  mock.emit();
  assert.equal(mock.runtime[disabledKey], true);
  assert.equal(mock.sent.length, 0);
  assert.deepEqual(changes, ["denied"]);
});
