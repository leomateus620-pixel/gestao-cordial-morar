import { test as it } from "node:test";
import assert from "node:assert/strict";
const describe = (_: string, fn: () => void) => fn();
const expect = (v: unknown) => ({ toBe: (e: unknown) => assert.equal(v, e) });
import { galleryMatchesExactly } from "./gallery-rebuild";

const item = (imageId: string | null, destaque = false) => ({ codigoImagem: imageId ? `c-${imageId}` : "x", imageId, destaque });

describe("galleryMatchesExactly", () => {
  it("galeria vazia não conclui quando há fotos", () => {
    expect(galleryMatchesExactly({ desiredImageIds: ["A", "B"], remote: [] })).toBe(false);
  });
  it("galeria só com a capa não conclui", () => {
    expect(galleryMatchesExactly({ desiredImageIds: ["A", "B"], remote: [item("A", true)] })).toBe(false);
  });
  it("ordem trocada não conclui", () => {
    expect(galleryMatchesExactly({ desiredImageIds: ["A", "B"], remote: [item("B", true), item("A")] })).toBe(false);
  });
  it("foto sem vínculo conhecido não conclui", () => {
    expect(galleryMatchesExactly({ desiredImageIds: ["A", "B"], remote: [item("A", true), item(null)] })).toBe(false);
  });
  it("duas capas não conclui", () => {
    expect(galleryMatchesExactly({ desiredImageIds: ["A", "B"], remote: [item("A", true), item("B", true)] })).toBe(false);
  });
  it("tudo igual conclui", () => {
    expect(galleryMatchesExactly({ desiredImageIds: ["A", "B"], remote: [item("A", true), item("B")] })).toBe(true);
  });
});
