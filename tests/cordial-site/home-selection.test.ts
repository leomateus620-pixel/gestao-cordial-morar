import { test } from "node:test";
import assert from "node:assert/strict";
import { selectFeatured, selectMore, editorialOverflow } from "../../src/lib/cordial-site/home-selection";
import type { PublicProperty } from "../../src/lib/cordial-site/contract";

const cover = { id: "x", version: "v" } as unknown as PublicProperty["cover"];
const p = (n: number, withCover = true) =>
  ({ id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`, cover: withCover ? cover : null }) as PublicProperty;
const ids = (list: PublicProperty[]) => list.map((x) => Number(x.id.slice(-4)));

test("modo recentes: cinco mais recentes, pulando quem não tem capa", () => {
  const recent = [p(1), p(2, false), p(3), p(4), p(5), p(6), p(7)];
  assert.deepEqual(ids(selectFeatured({ mode: "recentes", editorialIds: [], editorial: [], recent })), [1, 3, 4, 5, 6]);
});

test("modo editorial: ordem escolhida e vaga inválida completada pelos recentes", () => {
  const editorial = [p(9), p(8, false)];
  const recent = [p(9), p(1), p(2), p(3), p(4)];
  const out = selectFeatured({ mode: "editorial", editorialIds: [p(8).id, p(9).id], editorial, recent });
  assert.deepEqual(ids(out), [9, 1, 2, 3, 4]);
});

test("menos de cinco elegíveis mostra só os reais, sem repetir", () => {
  assert.deepEqual(ids(selectFeatured({ mode: "recentes", editorialIds: [], editorial: [], recent: [p(1), p(1), p(2)] })), [1, 2]);
});

test("mais imóveis: quinze distintos dos destaques, percorrendo páginas", () => {
  const page1 = Array.from({ length: 12 }, (_, i) => p(i + 1));
  const page2 = Array.from({ length: 12 }, (_, i) => p(i + 13));
  const out = selectMore([page1, page2], [p(1).id, p(2).id, p(3).id, p(4).id, p(5).id]);
  assert.equal(out.length, 15);
  assert.equal(ids(out)[0], 6);
  assert.equal(new Set(ids(out)).size, 15);
});

test("seleção antiga com nove imóveis informa os quatro excedentes", () => {
  assert.equal(editorialOverflow(["a", "b", "c", "d", "e", "f", "g", "h", "i"]).length, 4);
});
