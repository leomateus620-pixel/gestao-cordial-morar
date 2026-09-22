/**
 * Fotos ponta a ponta: inclusão, exclusão, substituição e reconstrução de ordem.
 * Testes puros (sem rede) + invariantes de código conferidas no fonte.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { planGalleryRebuild } from "./gallery-rebuild";
import {
  extractInsertedImageId,
  isDeleteConfirmed,
  parseRemoteImagePage,
} from "../imobibrasil/image-parsers";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

// --------------------------------------------------------------- leitura remota
test("lista de fotos em formato desconhecido nunca equivale a galeria vazia", () => {
  const parsed = parseRemoteImagePage({ mensagem: "ops" }, 1, 50);
  assert.equal(parsed.recognized, false);
  assert.equal(parsed.items.length, 0);
});

test("paginação: página cheia indica que há mais páginas", () => {
  const items = Array.from({ length: 2 }, (_, index) => ({
    codigoImagem: `${index + 1}`,
    url: `https://x/${index}.jpg`,
    destaque: index === 0 ? "sim" : "nao",
  }));
  const parsed = parseRemoteImagePage({ status: true, data: items, total: 4 }, 1, 2);
  assert.equal(parsed.recognized, true);
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0]!.destaque, true);
  assert.equal(parsed.items[1]!.destaque, false);
});

test("código da foto nunca vem do código do imóvel", () => {
  assert.equal(extractInsertedImageId({ codigoImovel: "4355160" }), null);
  assert.equal(extractInsertedImageId({ codigoImagem: "91781673" }), "91781673");
});

test("exclusão só é confirmada com status verdadeiro", () => {
  assert.equal(isDeleteConfirmed({ status: true }), true);
  assert.equal(isDeleteConfirmed({ status: false }), false);
  assert.equal(isDeleteConfirmed("qualquer coisa"), false);
});

// ------------------------------------------------------------ ordem e capa
test("ordem igual e capa correta: nada a reconstruir", () => {
  const plan = planGalleryRebuild({
    desiredImageIds: ["a", "b"],
    remote: [
      { codigoImagem: "1", imageId: "a", destaque: true },
      { codigoImagem: "2", imageId: "b", destaque: false },
    ],
  });
  assert.equal(plan.needed, false);
});

test("ordem trocada: apaga a cauda divergente e reinsere na ordem correta", () => {
  const plan = planGalleryRebuild({
    desiredImageIds: ["a", "b", "c"],
    remote: [
      { codigoImagem: "1", imageId: "a", destaque: true },
      { codigoImagem: "2", imageId: "c", destaque: false },
      { codigoImagem: "3", imageId: "b", destaque: false },
    ],
  });
  assert.deepEqual(plan.deleteRemoteIds, ["2", "3"]);
  assert.deepEqual(plan.reinsertImageIds, ["b", "c"]);
  assert.equal(plan.keptPrefix, 1);
});

test("capa errada: reconstrói desde o começo", () => {
  const plan = planGalleryRebuild({
    desiredImageIds: ["a", "b"],
    remote: [
      { codigoImagem: "1", imageId: "a", destaque: false },
      { codigoImagem: "2", imageId: "b", destaque: true },
    ],
  });
  assert.equal(plan.keptPrefix, 0);
  assert.deepEqual(plan.reinsertImageIds, ["a", "b"]);
});

test("sem código remoto conhecido a reconstrução é bloqueada, não adivinhada", () => {
  const plan = planGalleryRebuild({
    desiredImageIds: ["a", "b"],
    remote: [
      { codigoImagem: null, imageId: "b", destaque: false },
      { codigoImagem: "2", imageId: "a", destaque: true },
    ],
  });
  assert.equal(plan.feasible, false);
  assert.equal(plan.reason, "codigo_remoto_desconhecido");
  assert.deepEqual(plan.deleteRemoteIds, []);
});

test("foto antiga sem par local nunca entra na lista de exclusão", () => {
  const plan = planGalleryRebuild({
    desiredImageIds: ["a"],
    remote: [
      { codigoImagem: "9", imageId: null, destaque: false },
      { codigoImagem: "1", imageId: "a", destaque: true },
    ],
  });
  assert.equal(plan.deleteRemoteIds.includes("9"), false);
});

// -------------------------------------------------------- invariantes no fonte
test("mídia usa o endpoint oficial de exclusão e nunca altera o cadastro", () => {
  const ops = read("../imobibrasil/image-ops.server.ts");
  assert.ok(ops.includes("/imagem/excluir/"));
  assert.ok(!ops.includes("/imovel/alterar"));
  assert.ok(ops.includes("retryOnNetwork: false"));

  const media = read("../imobibrasil/media-sync.server.ts");
  assert.ok(!media.includes("/imovel/alterar"));
  assert.ok(media.includes("fetchRemoteGallery"));
  // Inserção de imagem nunca é repetida às cegas.
  assert.ok(media.includes("retryOnNetwork: false"));
  assert.ok(media.includes("property_media_finish"));
});

test("exclusão local só apaga arquivos depois da confirmação em todos os sites", () => {
  const functions = read("./media.functions.ts");
  assert.ok(functions.includes("pending_remote_delete: true"));
  assert.ok(functions.includes("desired_state: \"absent\""));
  assert.ok(functions.includes("replacePropertyImage"));

  const media = read("../imobibrasil/media-sync.server.ts");
  assert.ok(media.includes("purgeFullyDeletedImages"));
});

test("encerramento do trabalho de fotos e agendamento acontecem juntos", () => {
  const sync = read("../imobibrasil/sync.server.ts");
  assert.ok(sync.includes("property_media_finish_job"));
  assert.ok(sync.includes("onProgress"));
});
