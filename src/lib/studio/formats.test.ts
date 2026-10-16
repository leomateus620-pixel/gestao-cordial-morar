import { test } from "node:test";
import assert from "node:assert/strict";
import { STUDIO_FORMATS, clampCarouselSlides, isValidCarouselCount, clampVideoSeconds, isValidVideoDuration } from "./formats.ts";

test("formatos têm dimensões esperadas", () => {
  assert.equal(STUDIO_FORMATS.story.width, 1080);
  assert.equal(STUDIO_FORMATS.story.height, 1920);
  assert.equal(STUDIO_FORMATS.feed_quadrado.width, 1080);
  assert.equal(STUDIO_FORMATS.feed_quadrado.height, 1080);
  assert.equal(STUDIO_FORMATS.feed_retrato.height, 1350);
});

test("clamp e validação de slides do carrossel", () => {
  assert.equal(clampCarouselSlides(0), 1);
  assert.equal(clampCarouselSlides(99), 10);
  assert.equal(isValidCarouselCount(5), true);
  assert.equal(isValidCarouselCount(0), false);
});

test("clamp e validação de duração de vídeo", () => {
  assert.equal(clampVideoSeconds(1), 6);
  assert.equal(clampVideoSeconds(99), 15);
  assert.equal(isValidVideoDuration(10), true);
  assert.equal(isValidVideoDuration(1), false);
});
