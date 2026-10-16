import { test } from "node:test";
import assert from "node:assert/strict";
import { coverCrop, isCropWithinBounds, sha256Hex } from "./crop.ts";

test("cover crop cabe dentro da imagem original e sem distorção", () => {
  const crop = coverCrop(2000, 1000, 9 / 16);
  assert.ok(isCropWithinBounds(crop, 2000, 1000));
  const cropAspect = crop.width / crop.height;
  assert.ok(Math.abs(cropAspect - 9 / 16) < 1e-9);
});

test("cover crop para fonte mais alta que o alvo corta topo/base", () => {
  const crop = coverCrop(1000, 2000, 1);
  assert.ok(isCropWithinBounds(crop, 1000, 2000));
  assert.equal(crop.width, 1000);
  assert.ok(crop.height < 2000);
});

test("isCropWithinBounds rejeita janela fora dos limites", () => {
  assert.equal(isCropWithinBounds({ x: -10, y: 0, width: 100, height: 100 }, 100, 100), false);
  assert.equal(isCropWithinBounds({ x: 0, y: 0, width: 150, height: 100 }, 100, 100), false);
});

test("sha256Hex é estável para os mesmos bytes", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  const h1 = await sha256Hex(bytes);
  const h2 = await sha256Hex(new Uint8Array([1, 2, 3, 4, 5]));
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
  const h3 = await sha256Hex(new Uint8Array([1, 2, 3, 4, 6]));
  assert.notEqual(h1, h3);
});
