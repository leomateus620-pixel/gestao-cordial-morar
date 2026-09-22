import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchAllImagePagesWith } from "./image-list";

test("image list reads all pages, including seventeen images", async () => {
  const calls: number[] = [];
  const result = await fetchAllImagePagesWith(async (page) => {
    calls.push(page);
    return {
      recognized: true, page, totalPagesKnown: true, totalPages: 3,
      items: Array.from({ length: page === 3 ? 1 : 8 }, (_, i) => ({ codigoImagem: `${(page - 1) * 8 + i}` })),
    } as never;
  });
  assert.equal(result.length, 17);
  assert.deepEqual(calls, [1, 2, 3]);
});

test("image list rejects repeated pages and unknown empty responses", async () => {
  await assert.rejects(
    fetchAllImagePagesWith(async (page) => ({
      recognized: true, page, totalPagesKnown: false,
      items: [{ codigoImagem: "same" }],
    } as never)),
    /repetiu uma página/,
  );
  await assert.rejects(
    fetchAllImagePagesWith(async (page) => ({
      recognized: false, page, totalPagesKnown: false, items: [],
    } as never)),
    /inconclusiva/,
  );
});
