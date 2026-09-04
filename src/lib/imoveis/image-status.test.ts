import assert from "node:assert/strict";
import test from "node:test";
import { canPublishPropertyImage, isImageProcessingBlocking } from "./image-status.ts";

test("todos os estados incompletos bloqueiam a publicação", () => {
  for (const status of [
    "pending",
    "processing",
    "failed_retryable",
    "failed_permanent",
    "failed",
  ]) {
    assert.equal(isImageProcessingBlocking(status), true, status);
  }
  assert.equal(isImageProcessingBlocking("ready"), false);
  assert.equal(isImageProcessingBlocking("legacy"), false);
});

test("foto nova só publica quando está pronta e possui derivada marcada", () => {
  assert.equal(
    canPublishPropertyImage({ processing_status: "ready", processed_storage_path: "marcada.jpg" }),
    true,
  );
  assert.equal(
    canPublishPropertyImage({ processing_status: "ready", processed_storage_path: null }),
    false,
  );
  assert.equal(
    canPublishPropertyImage({
      processing_status: "failed_permanent",
      processed_storage_path: null,
    }),
    false,
  );
  assert.equal(
    canPublishPropertyImage({ processing_status: "legacy", processed_storage_path: null }),
    true,
  );
});
