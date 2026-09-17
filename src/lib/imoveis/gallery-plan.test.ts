import { strict as assert } from "node:assert";
import test from "node:test";
import {
  isExtensionError,
  isRateLimitError,
  planGalleryDelivery,
  safeDeliveryFileName,
  sortGallery,
  type LocalGalleryImage,
  type RemoteGalleryRow,
} from "./gallery-plan";

function local(id: string, position: number, hash = `h-${id}`): LocalGalleryImage {
  return { id, position, isCover: position === 0, deliveredHash: hash };
}

function remote(
  id: string,
  overrides: Partial<RemoteGalleryRow> = {},
): RemoteGalleryRow {
  return {
    image_id: id,
    content_hash: `h-${id}`,
    status: "synced",
    synced_position: 0,
    is_cover: false,
    attempts: 0,
    next_retry_at: null,
    ...overrides,
  };
}

test("ordena pela posição escolhida no Gestão", () => {
  const ordered = sortGallery([local("b", 2), local("a", 0), local("c", 1)]);
  assert.deepEqual(
    ordered.map((image) => image.id),
    ["a", "c", "b"],
  );
});

test("envia todas as fotos novas na ordem local", () => {
  const plan = planGalleryDelivery([local("a", 0), local("b", 1), local("c", 2)], []);
  assert.deepEqual(
    plan.toSend.map((image) => image.id),
    ["a", "b", "c"],
  );
  assert.equal(plan.expectedCount, 3);
  assert.equal(plan.syncedCount, 0);
});

test("nunca reenvia foto já sincronizada com o mesmo arquivo", () => {
  const plan = planGalleryDelivery(
    [local("a", 0), local("b", 1)],
    [remote("a", { synced_position: 0, is_cover: true })],
  );
  assert.deepEqual(
    plan.toSend.map((image) => image.id),
    ["b"],
  );
  assert.equal(plan.syncedCount, 1);
});

test("respeita a espera programada da foto com falha", () => {
  const now = Date.now();
  const plan = planGalleryDelivery(
    [local("a", 0)],
    [
      remote("a", {
        status: "error",
        next_retry_at: new Date(now + 60_000).toISOString(),
      }),
    ],
    now,
  );
  assert.deepEqual(plan.toSend, []);
  assert.deepEqual(plan.waiting, ["a"]);
  assert.equal(plan.failedCount, 1);
});

test("reenvia quando a espera já venceu", () => {
  const now = Date.now();
  const plan = planGalleryDelivery(
    [local("a", 0)],
    [
      remote("a", {
        status: "error",
        next_retry_at: new Date(now - 60_000).toISOString(),
      }),
    ],
    now,
  );
  assert.deepEqual(
    plan.toSend.map((image) => image.id),
    ["a"],
  );
});

test("posição 7 → 2 é reconhecida como mudança de ordem", () => {
  const plan = planGalleryDelivery(
    [local("a", 0), local("b", 1)],
    [
      remote("a", { synced_position: 7, is_cover: true }),
      remote("b", { synced_position: 2 }),
    ],
  );
  assert.equal(plan.orderDrift, true);
});

test("ordem coerente não acusa divergência", () => {
  const plan = planGalleryDelivery(
    [local("a", 0), local("b", 1)],
    [
      remote("a", { synced_position: 0, is_cover: true }),
      remote("b", { synced_position: 1 }),
    ],
  );
  assert.equal(plan.orderDrift, false);
  assert.equal(plan.coverDrift, false);
});

test("capa diferente da remota é detectada", () => {
  const plan = planGalleryDelivery(
    [local("a", 0)],
    [remote("a", { synced_position: 0, is_cover: false })],
  );
  assert.equal(plan.coverDrift, true);
});

test("nome do arquivo entregue é seguro e minúsculo", () => {
  assert.equal(
    safeDeliveryFileName("abc-123", { converted: true, originalName: "DJI_0765.JPG" }),
    "abc-123.jpg",
  );
  assert.equal(safeDeliveryFileName("abc", { originalName: "FOTO.JPEG" }), "abc.jpg");
  assert.equal(safeDeliveryFileName("abc", { originalName: "foto.PNG" }), "abc.png");
  assert.equal(safeDeliveryFileName("abc", { originalName: "foto.WEBP" }), "abc.webp");
  assert.equal(safeDeliveryFileName("abc", { originalName: "foto.heic" }), "abc.jpg");
  assert.equal(safeDeliveryFileName("a b/c", { mimeType: "image/jpeg" }), "abc.jpg");
});

test("classifica erros do site", () => {
  assert.equal(isExtensionError("A extensão da imagem é inválida!"), true);
  assert.equal(isExtensionError("erro 523"), false);
  assert.equal(isRateLimitError("máximo de 20 requisições por minuto"), true);
  assert.equal(isRateLimitError("timeout"), false);
});
