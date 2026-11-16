import test from "node:test";
import assert from "node:assert/strict";
import { repository } from "../../src/lib/public-property-bot/repository.server";
import { BotError } from "../../src/lib/public-property-bot/errors";

async function withTransport(run: () => Promise<void>) {
  const values = {
    PUBLIC_BOT_DATABASE_REST_URL: "https://synthetic-project.supabase.co/rest/v1/",
    PUBLIC_BOT_GATEWAY_SECRET: "synthetic-bot-only-secret",
    PUBLIC_BOT_GATEWAY_KEY: "synthetic-publishable-key",
    SUPABASE_SERVICE_ROLE_KEY: "PRIVATE-SERVICE-ROLE-SENTINEL",
  };
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, values);
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(values)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}
test("repository uses a fixed opaque gateway operation and never an internal credential", () =>
  withTransport(async () => {
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(
        String(url),
        "https://synthetic-project.supabase.co/rest/v1/rpc/public_bot_gateway",
      );
      assert.equal(init?.method, "POST");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("x-public-bot-key"), "synthetic-bot-only-secret");
      assert.equal(headers.get("apikey"), "synthetic-publishable-key");
      assert.equal(headers.get("content-profile"), "public");
      assert.equal(headers.get("authorization"), null);
      assert.deepEqual(JSON.parse(String(init?.body)), {
        op: "configuration",
        payload: { b: "morar" },
      });
      assert(!String(init?.body).includes("secret"));
      assert(!JSON.stringify([...headers]).includes("PRIVATE-SERVICE"));
      return Response.json({ enabled: true, voice: false, trends: false, whatsapp: "" });
    };
    assert.equal((await repository.configuration("morar")).enabled, true);
    assert.equal(calls, 1);
  }));
test("missing scoped credential and malformed gateway origins fail closed without service-role fallback", () =>
  withTransport(async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json({});
    };
    delete process.env.PUBLIC_BOT_GATEWAY_SECRET;
    await assert.rejects(
      () => repository.configuration("cordial"),
      (error) => error instanceof BotError && error.code === "service_unavailable",
    );
    process.env.PUBLIC_BOT_GATEWAY_SECRET = "synthetic-bot-only-secret";
    for (const base of [
      "http://test.invalid/rest/v1/",
      "https://user:pass@test.invalid/rest/v1/",
      "https://test.invalid/rest/v1/?token=private",
      "https://test.invalid/other/",
    ]) {
      process.env.PUBLIC_BOT_DATABASE_REST_URL = base;
      await assert.rejects(() => repository.configuration("cordial"));
    }
    assert.equal(calls, 0);
  }));
test("expired session has an explicit session error and never yields another visitor's history", () =>
  withTransport(async () => {
    globalThis.fetch = async () => Response.json(null);
    await assert.rejects(
      () => repository.readSession("cordial", "0".repeat(64)),
      (error) =>
        error instanceof BotError && error.code === "session_expired" && error.status === 401,
    );
  }));
test("database responses are bounded during streaming and failures stay infrastructure-neutral", () =>
  withTransport(async () => {
    let cancelled = false;
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(2_000_001));
          },
          cancel() {
            cancelled = true;
          },
        }),
      );
    await assert.rejects(
      () => repository.configuration("cordial"),
      (error) => error instanceof BotError && error.code === "service_unavailable",
    );
    assert.equal(cancelled, true);
  }));
test("cancellation reaches a stalled database response reader", () =>
  withTransport(async () => {
    const controller = new AbortController();
    let cancelled = false;
    globalThis.fetch = async () => {
      queueMicrotask(() => controller.abort());
      return new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
      );
    };
    await assert.rejects(
      () => repository.configuration("cordial", controller.signal),
      (error) => error instanceof BotError && error.code === "service_unavailable",
    );
    assert.equal(cancelled, true);
  }));
