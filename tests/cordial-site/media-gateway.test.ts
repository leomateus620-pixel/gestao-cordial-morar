import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaResponse, videoResponse } from "../../src/lib/cordial-site/http.server";
import { checksum } from "../../src/lib/cordial-site/media-derivatives.server";
test("warm persisted image is reauthorized before and after read; withdrawal releases no bytes", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL,
    originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://gateway-qa.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-controlled-gateway-test-secret";
  const id = "00000000-0000-4000-8000-000000000001",
    version = "a".repeat(32);
  const bytes = Uint8Array.from([255, 216, ...Array(32).fill(5), 255, 217]);
  const hash = await checksum(bytes);
  let authorizations = 0,
    storageReads = 0,
    withdrawn = false,
    withdrawWhileReading = false;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/rest/v1/cordial_site_authorized_media")) {
      authorizations++;
      return Response.json(
        withdrawn ? [] : [{ id, storage_path: "private/original.jpg", width: 100, height: 80 }],
      );
    }
    if (url.includes("/rest/v1/public_site_derivatives"))
      return Response.json([{ checksum: hash, state: "ready" }]);
    if (url.includes("/storage/v1/object/public-site-derivatives/")) {
      storageReads++;
      if (withdrawWhileReading) withdrawn = true;
      return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/jpeg" } });
    }
    throw new Error(
      `Unexpected gateway operation: ${new URL(url).pathname.split("/").slice(0, 4).join("/")}`,
    );
  };
  try {
    const warm = await mediaResponse(id, version, "card");
    assert.equal(warm.status, 200);
    assert.equal(authorizations, 2);
    assert.equal(storageReads, 1);
    assert.equal(warm.headers.get("Cache-Control"), "private, max-age=30, must-revalidate");
    assert.deepEqual(new Uint8Array(await warm.arrayBuffer()), bytes);
    const conditional = await mediaResponse(
      id,
      version,
      "card",
      "cordial",
      new Request("https://qa.invalid/image", {
        headers: { "If-None-Match": warm.headers.get("ETag")! },
      }),
    );
    assert.equal(conditional.status, 304);
    assert.equal(storageReads, 1);
    assert.equal(authorizations, 3);
    withdrawWhileReading = true;
    const withdrawnDuring = await mediaResponse(id, version, "card");
    assert.equal(withdrawnDuring.status, 404);
    assert.equal(authorizations, 5);
    assert.equal(storageReads, 2);
    assert.equal((await mediaResponse(id, version, "card")).status, 404);
    assert.equal(storageReads, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});
test("video range validation happens before storage and a non-Cordial brand has no gateway", async () => {
  const request = new Request("https://qa.invalid/api/cordial-site/video/a/b", {
    headers: { Range: "bytes=0-2,10-15" },
  });
  const id = "00000000-0000-4000-8000-000000000001",
    version = "a".repeat(32);
  assert.equal((await videoResponse(request, id, version)).status, 416);
  assert.equal((await videoResponse(request, id, version, "morar")).status, 404);
});
