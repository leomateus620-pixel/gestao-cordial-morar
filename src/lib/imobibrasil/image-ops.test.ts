import test from "node:test";
import assert from "node:assert/strict";
import { fetchRemoteGallery } from "./image-ops.server";

const image = (n: number) => ({ codigoImagem: String(n), url: `https://site.invalid/${n}.jpg` });

test("leitura da galeria percorre página cheia sem metadados", async () => {
  const pages: number[] = [];
  const gallery = await fetchRemoteGallery("cordial", "fixture", undefined, async (page) => {
    pages.push(page);
    return page === 1 ? Array.from({ length: 50 }, (_, index) => image(index + 1)) :
      page === 2 ? [image(51)] : [];
  });
  assert.equal(gallery.reliable, true);
  assert.equal(gallery.items.length, 51);
  assert.deepEqual(pages, [1, 2, 3]);
});

test("limite silencioso de página não interrompe a leitura", async () => {
  const pages: number[] = [];
  const gallery = await fetchRemoteGallery("cordial", "fixture", undefined, async (page) => {
    pages.push(page);
    return page === 1 ? Array.from({ length: 20 }, (_, index) => image(index + 1)) :
      page === 2 ? [image(21)] : [];
  });
  assert.equal(gallery.reliable, true);
  assert.equal(gallery.items.length, 21);
  assert.deepEqual(pages, [1, 2, 3]);
});

test("código ausente ou página repetida torna ausência inconclusiva", async () => {
  const unknown = await fetchRemoteGallery("morar", "fixture", undefined,
    async () => [{ url: "https://site.invalid/sem-codigo.jpg" }]);
  assert.equal(unknown.reliable, false);
  assert.equal(unknown.reason, "identidade_incompleta");

  const repeated = await fetchRemoteGallery("cordial", "fixture", undefined,
    async () => Array.from({ length: 50 }, (_, index) => image(index + 1)));
  assert.equal(repeated.reliable, false);
  assert.equal(repeated.reason, "identidade_incompleta");

  const malformed = await fetchRemoteGallery("cordial", "fixture", undefined,
    async () => [image(1), { arquivo: "desconhecido" }]);
  assert.equal(malformed.reliable, false);
  assert.equal(malformed.reason, "formato_desconhecido");
});
