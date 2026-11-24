import { describe, expect, it } from "vitest";
import { pickThumbUrl, resolveGalleryMode, resolveGalleryPhotos } from "./gallery-fallback";

const legacy = [
  { id: "b", uploadKey: null, position: 1 },
  { id: "a", uploadKey: null, position: 0 },
  { id: "c", uploadKey: null, position: 2 },
];

describe("galeria: modo fila x modo de segurança", () => {
  it("só fotos antigas com a lista carregada fica em queue", () => {
    expect(resolveGalleryMode(legacy, ["c", "a", "b"])).toBe("queue");
  });
  it("mistura antigas (id) e novas (galeria-uuid) completa fica em queue", () => {
    const mixed = [...legacy, { id: "n1", uploadKey: "galeria-123", position: 3 }];
    expect(resolveGalleryMode(mixed, ["a", "b", "c", "galeria-123"])).toBe("queue");
  });
  it("fila completa mantém a ordem e a capa da fila", () => {
    const r = resolveGalleryPhotos({
      activeImages: legacy, loadedKeys: ["c", "a", "b"],
      queuePhotos: [legacy[2]!, legacy[1]!, legacy[0]!], fallbackImages: [],
    });
    expect(r.photos.map((p) => p.id)).toEqual(["c", "a", "b"]);
  });
  it("faltando uma foto ativa na lista: safe com a ordem inteira do banco", () => {
    const r = resolveGalleryPhotos({
      activeImages: legacy, loadedKeys: ["c", "a"], queuePhotos: [legacy[2]!, legacy[1]!], fallbackImages: [],
    });
    expect(r.mode).toBe("safe");
    expect(r.photos.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
  it("lista vazia ou não carregada: safe, nenhuma foto some", () => {
    expect(resolveGalleryMode(legacy, [])).toBe("safe");
    const r = resolveGalleryPhotos({ activeImages: undefined, loadedKeys: undefined, queuePhotos: [], fallbackImages: legacy });
    expect(r.mode).toBe("safe");
    expect(r.photos).toHaveLength(3);
  });
});

describe("miniatura", () => {
  it("foto antiga sem miniatura usa a foto inteira", () => {
    expect(pickThumbUrl(undefined, "full")).toBe("full");
  });
  it("foto com miniatura gravada usa a miniatura", () => {
    expect(pickThumbUrl("thumb", "full")).toBe("thumb");
  });
});
