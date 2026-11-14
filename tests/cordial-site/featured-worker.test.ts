import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeFeaturedPhoto,
  renderFeaturedVariants,
} from "../../src/lib/site-showcase/featured.server";
import { encodeJpeg, decodeRaster } from "../../src/lib/imoveis/watermark-purejs.server";
import { featuredMediaResponse } from "../../src/lib/site-showcase/featured-public.server";
import { createClient } from "@supabase/supabase-js";
import { checksum } from "../../src/lib/cordial-site/media-derivatives.server";

const plan = {
  exposure: 0.12,
  contrast: 1.02,
  saturation: 1.01,
  warmth: 0,
  shadows: 0.02,
  sharpness: 0.1,
  reason: "Abrir as sombras com suavidade.",
};
test("AI analysis is bounded and interrupted streaming is not silently retried", async () => {
  const originalFetch = globalThis.fetch,
    key = process.env.LOVABLE_API_KEY;
  process.env.LOVABLE_API_KEY = "controlled-test-key";
  let calls = 0,
    complete = true;
  globalThis.fetch = async (_input, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    assert.equal(body.input[0].content[1].image_url, "https://fixture.invalid/photo");
    assert.equal(body.text.format.schema.additionalProperties, false);
    return new Response(
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta: JSON.stringify(plan) })}\n\n${complete ? 'data: {"type":"response.completed"}\n\n' : ""}`,
    );
  };
  try {
    assert.deepEqual(await analyzeFeaturedPhoto("https://fixture.invalid/photo"), plan);
    complete = false;
    await assert.rejects(analyzeFeaturedPhoto("https://fixture.invalid/photo"), /não confirmou/);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.LOVABLE_API_KEY;
    else process.env.LOVABLE_API_KEY = key;
  }
});
test("offline renderer preserves aspect ratio, avoids upscaling and produces every verified JPEG", async () => {
  const width = 600,
    height = 400,
    data = new Uint8Array(width * height * 4);
  for (let p = 0; p < data.length; p += 4) {
    data[p] = 80;
    data[p + 1] = 90;
    data[p + 2] = 100;
    data[p + 3] = 255;
  }
  const original = encodeJpeg({ width, height, data }, 90),
    copy = original.slice();
  const variants = await renderFeaturedVariants(original, plan);
  assert.deepEqual(original, copy);
  assert.deepEqual(
    variants.map((v) => [v.size, v.width, v.height]),
    [
      ["thumb", 480, 320],
      ["card", 600, 400],
      ["full", 600, 400],
    ],
  );
  for (const v of variants) {
    assert.equal(v.checksum, await checksum(v.bytes));
    const raster = decodeRaster(v.bytes, "image/jpeg");
    assert.equal(raster.width, v.width);
    assert.equal(raster.height, v.height);
  }
});
test("treated gateway reauthorizes cache and conditional requests, blocks cross-brand and corrupt variants", async () => {
  const oldFetch = globalThis.fetch,
    bytes = Uint8Array.from([255, 216, 1, 2, 255, 217]),
    hash = await checksum(bytes);
  const db = createClient("https://featured-qa.invalid", "controlled-test-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let authorized = true,
    corrupt = false,
    withdrawDuring = false,
    reads = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/rest/v1/"))
      return Response.json(
        authorized && url.includes("cordial_site_featured_authorized")
          ? [
              {
                storage_prefix: "featured/test",
                variants: {
                  card: { checksum: hash, bytes: bytes.length },
                  thumb: { checksum: hash, bytes: bytes.length },
                  full: { checksum: hash, bytes: bytes.length },
                },
              },
            ]
          : [],
      );
    if (url.includes("/storage/v1/")) {
      reads++;
      if (withdrawDuring) authorized = false;
      return new Response(corrupt ? new Uint8Array(bytes.length) : bytes);
    }
    throw new Error("Unexpected URL");
  };
  try {
    const get = (brand: "cordial" | "morar" = "cordial", size = "card", request?: Request) =>
      featuredMediaResponse(
        db,
        brand,
        "00000000-0000-4000-8000-000000000002",
        "a".repeat(32),
        size,
        "b".repeat(64),
        request,
      );
    const first = await get();
    assert.equal(first.status, 200);
    assert.equal(reads, 1);
    assert.deepEqual(new Uint8Array(await first.arrayBuffer()), bytes);
    assert.equal((await get()).status, 200);
    assert.equal(reads, 1);
    assert.equal((await get("morar")).status, 404);
    authorized = false;
    assert.equal((await get()).status, 404);
    assert.equal(
      (
        await get(
          "cordial",
          "card",
          new Request("https://fixture.invalid", { headers: { "If-None-Match": `"${hash}"` } }),
        )
      ).status,
      404,
    );
    authorized = true;
    corrupt = true;
    assert.equal((await get("cordial", "thumb")).status, 404);
    corrupt = false;
    withdrawDuring = true;
    assert.equal((await get("cordial", "full")).status, 404);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
