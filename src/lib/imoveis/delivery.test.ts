import test from "node:test";
import assert from "node:assert/strict";
import {
  DELIVERY_STEPS,
  IMOBI_IMAGE_MAX_BYTES,
  classifyImageDeliveryError,
  imageRetryDelaySeconds,
  isWithinBudget,
  nextImageRetryAt,
  pickDeliveryStep,
  shouldRetryImageDelivery,
} from "./delivery.ts";

test("orçamento fica abaixo do limite de 1 MB do provedor", () => {
  assert.ok(IMOBI_IMAGE_MAX_BYTES < 1_048_576);
  assert.equal(isWithinBudget(500_000), true);
  assert.equal(isWithinBudget(0), false);
  assert.equal(isWithinBudget(2_000_000), false);
});

test("escolhe o primeiro degrau que cabe no orçamento", () => {
  const chosen = pickDeliveryStep([1_400_000, 900_000, 400_000, 200_000]);
  assert.equal(chosen?.index, 1);
  assert.deepEqual(chosen?.step, DELIVERY_STEPS[1]);
});

test("ignora degraus que falharam e segue para o próximo", () => {
  const chosen = pickDeliveryStep([null, null, 300_000, 100_000]);
  assert.equal(chosen?.index, 2);
});

test("devolve nulo quando nenhum degrau cabe", () => {
  assert.equal(pickDeliveryStep([2_000_000, 1_500_000, 1_200_000, 1_100_000]), null);
});

test("classifica as falhas conhecidas dos sites", () => {
  assert.equal(classifyImageDeliveryError("A imagem deve conter no máximo 1 MB!"), "imagem_grande");
  assert.equal(classifyImageDeliveryError("error code: 523"), "rede");
  assert.equal(classifyImageDeliveryError("cloudflare gateway"), "rede");
  assert.equal(classifyImageDeliveryError("Falha ao ler a imagem no armazenamento."), "armazenamento");
  assert.equal(classifyImageDeliveryError("Imóvel inexistente"), "provedor");
  assert.equal(classifyImageDeliveryError(""), "desconhecido");
});

test("reenvio automático respeita classe e número de tentativas", () => {
  assert.equal(shouldRetryImageDelivery("rede", 1), true);
  assert.equal(shouldRetryImageDelivery("imagem_grande", 3), true);
  assert.equal(shouldRetryImageDelivery("armazenamento", 1), false);
  assert.equal(shouldRetryImageDelivery("rede", 6), false);
});

test("espera entre tentativas é crescente", () => {
  assert.equal(imageRetryDelaySeconds(1), 60);
  assert.equal(imageRetryDelaySeconds(2), 300);
  assert.ok(imageRetryDelaySeconds(5) >= imageRetryDelaySeconds(4));
  assert.equal(imageRetryDelaySeconds(9), imageRetryDelaySeconds(5));
});

test("agenda a próxima tentativa somente quando faz sentido", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(nextImageRetryAt("rede", 1, now), "2026-01-01T00:01:00.000Z");
  assert.equal(nextImageRetryAt("armazenamento", 1, now), null);
  assert.equal(nextImageRetryAt("rede", 6, now), null);
});
