import test from "node:test";
import assert from "node:assert/strict";
import { detailImageTotal, fetchRemoteGallery } from "./image-ops.server";

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

  // Página 2 com sobreposição parcial continua inconclusiva.
  const overlap = await fetchRemoteGallery("cordial", "fixture", undefined,
    async (page) => page === 1 ? [image(1), image(2)] : [image(2), image(3)]);
  assert.equal(overlap.reliable, false);
  assert.equal(overlap.reason, "identidade_incompleta");

  const malformed = await fetchRemoteGallery("cordial", "fixture", undefined,
    async () => [image(1), { arquivo: "desconhecido" }]);
  assert.equal(malformed.reliable, false);
  assert.equal(malformed.reason, "formato_desconhecido");
});

// Contrato real 23/09/2026: a API ignora page/per_page e devolve tudo sempre.
const all58 = Array.from({ length: 58 }, (_, index) => ({ ...image(index + 1), destaque: index === 0 }));

test("repetição com total da ficha igual prova lista completa (58 fotos)", async () => {
  const gallery = await fetchRemoteGallery("morar", "fixture", undefined, async () => all58, async () => 58);
  assert.equal(gallery.reliable, true);
  assert.equal(gallery.items.length, 58);
});

test("repetição sem total independente continua inconclusiva", async () => {
  const gallery = await fetchRemoteGallery("morar", "fixture", undefined, async () => all58, async () => null);
  assert.equal(gallery.reliable, false);
});

test("lista cortada em 50 com ficha dizendo 58 fica inconclusiva", async () => {
  const cut = all58.slice(0, 50);
  const gallery = await fetchRemoteGallery("morar", "fixture", undefined, async () => cut, async () => 58);
  assert.equal(gallery.reliable, false);
  assert.equal(gallery.reason, "paginacao_incompleta");
});

test("falha ao ler a ficha mantém a leitura inconclusiva", async () => {
  const gallery = await fetchRemoteGallery("morar", "fixture", undefined, async () => all58,
    async () => { throw new Error("429"); });
  assert.equal(gallery.reliable, false);
});

test("detailImageTotal só aceita lista de imagens reconhecida", () => {
  assert.equal(detailImageTotal({ resultSet: { imagens: [1, 2, 3] } }), 3);
  assert.equal(detailImageTotal({ resultSet: {} }), null);
  assert.equal(detailImageTotal(null), null);
});

test("repetição com capa ou ordem diferente não é aceita como completa", async () => {
  const first = [image(1), image(2)];
  const reordered = await fetchRemoteGallery("cordial", "fixture", undefined,
    async (page) => page === 1 ? first : [image(2), image(1)]);
  assert.equal(reordered.reliable, false);
  const cover = await fetchRemoteGallery("cordial", "fixture", undefined,
    async (page) => page === 1 ? first : [{ ...image(1), destaque: true }, image(2)]);
  assert.equal(cover.reliable, false);
});
