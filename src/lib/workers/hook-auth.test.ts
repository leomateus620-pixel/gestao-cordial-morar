import { strict as assert } from "node:assert";
import { test } from "node:test";
import { authorizeWorkerRequest } from "./hook-auth";

test("worker hook rejects public key even if configured as a worker secret", () => {
  const original = {
    worker: process.env.WORKER_HOOK_SECRET,
    legacy: process.env.PROPERTY_SYNC_WORKER_SECRET,
    public: process.env.SUPABASE_ANON_KEY,
  };
  try {
    process.env.SUPABASE_ANON_KEY = "public-test-key";
    process.env.WORKER_HOOK_SECRET = "public-test-key";
    delete process.env.PROPERTY_SYNC_WORKER_SECRET;
    const denied = authorizeWorkerRequest(new Request("https://example.invalid/worker", {
      headers: { apikey: "public-test-key" },
    }));
    assert.equal(denied?.status, 503);
    process.env.WORKER_HOOK_SECRET = "private-test-key";
    assert.equal(authorizeWorkerRequest(new Request("https://example.invalid/worker", {
      headers: { apikey: "public-test-key" },
    }))?.status, 401);
    assert.equal(authorizeWorkerRequest(new Request("https://example.invalid/worker", {
      headers: { apikey: "private-test-key" },
    })), null);
  } finally {
    for (const [name, value] of [
      ["WORKER_HOOK_SECRET", original.worker],
      ["PROPERTY_SYNC_WORKER_SECRET", original.legacy],
      ["SUPABASE_ANON_KEY", original.public],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
