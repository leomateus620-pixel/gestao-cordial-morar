import { act } from "react";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCardPhotos } from "../../src/components/cordial-site/useCardPhotos";
import type { CardGalleryHint } from "../../src/lib/cordial-site/card-gallery";
import type { PublicMedia, PublicProperty } from "../../src/lib/cordial-site/contract";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  preload: vi.fn(),
  speculate: vi.fn(),
}));

vi.mock("@/lib/cordial-site/card-gallery", () => ({
  requestCardGallery: mocks.load,
  SpeculativeDropped: class extends Error {},
}));
vi.mock("@/lib/cordial-site/card-photo-preload", () => ({
  DEFAULT_CARD_SIZES: "100vw",
  PreloadDropped: class extends Error {},
  canSpeculatePhotos: mocks.speculate,
  preloadCardImage: mocks.preload,
  takeSpeculativeSlot: () => false,
}));

function deferred<T>() {
  let resolve!: (result: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const photos = ["cover", "next", "third", "last"].map((id, position) => ({
  id,
  position,
  version: "version",
  width: 960,
  height: 640,
}));
const property = {
  id: "property",
  photoCount: photos.length,
  cover: photos[0],
} as PublicProperty;
const root = { current: null };
const renderPhotos = (initialProps = property, hint?: Promise<CardGalleryHint | null>) =>
  renderHook((p) => useCardPhotos(p, "morar", root, "240px", hint), { initialProps });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.load.mockResolvedValue(photos);
  mocks.preload.mockResolvedValue(undefined);
  mocks.speculate.mockReturnValue(false);
});
afterEach(cleanup);

it("counts clicks while gallery metadata is pending and only preloads the final target", async () => {
  const metadata = deferred<PublicMedia[]>();
  mocks.load.mockReturnValue(metadata.promise);
  const target = deferred<void>();
  mocks.preload.mockReturnValue(target.promise);
  const { result } = renderPhotos();

  act(() => {
    void result.current.move(1);
    void result.current.move(1);
  });
  expect(result.current.media?.id).toBe("cover");
  await act(async () => metadata.resolve(photos));
  expect(mocks.preload.mock.calls).toEqual([[photos[2], "morar", "240px", true]]);
  expect(result.current.index).toBe(0);
  expect(result.current.switching).toBe(true);

  await act(async () => target.resolve(undefined));
  expect(result.current.media?.id).toBe("third");
  expect(result.current.index).toBe(2);
  expect(result.current.switching).toBe(false);
});

it("ignores out-of-order image loads and a response for a different property", async () => {
  const first = deferred<void>();
  const second = deferred<void>();
  mocks.preload.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const { result, rerender } = renderPhotos();
  await act(async () => {
    void result.current.move(1);
  });
  await act(async () => {
    void result.current.move(1);
  });
  await act(async () => second.resolve(undefined));
  await act(async () => first.resolve(undefined));
  expect(result.current.media?.id).toBe("third");

  const old = deferred<void>();
  mocks.preload.mockReturnValueOnce(old.promise);
  await act(async () => {
    void result.current.move(1);
  });
  rerender({ ...property, id: "different", cover: { ...photos[0], id: "other-cover" } });
  await act(async () => old.resolve(undefined));
  expect(result.current.media?.id).toBe("other-cover");
  expect(result.current.index).toBe(0);
});

it("keeps the visible photo on error and loads a retry even with data saving enabled", async () => {
  mocks.preload.mockRejectedValueOnce(new Error("image"));
  const { result } = renderPhotos();
  act(() => result.current.prepare(-1));
  expect(mocks.load).not.toHaveBeenCalled();
  await act(() => result.current.move(1));
  expect(result.current.media?.id).toBe("cover");
  expect(result.current.failed).toBe(true);
  await act(() => result.current.move(1));
  expect(result.current.media?.id).toBe("next");
  expect(result.current.failed).toBe(false);
});

it("prepares the previous photo when that control receives intent", async () => {
  mocks.speculate.mockReturnValue(true);
  const { result } = renderPhotos();
  await act(async () => result.current.prepare(-1));
  expect(mocks.load).toHaveBeenCalledWith("property", "morar", false, expect.any(String));
  expect(mocks.preload.mock.calls).toEqual([[photos[3], "morar", "240px"]]);
});

it("reuses matching server metadata and ignores a hint from another cover version", async () => {
  mocks.speculate.mockReturnValue(true);
  const hint = deferred<CardGalleryHint>();
  const { result, rerender } = renderPhotos(property, hint.promise);
  await act(async () => {
    hint.resolve({ propertyId: property.id, coverRevision: "cover:version", items: photos });
  });
  expect(result.current.galleryState).toBe("ready");
  expect(mocks.load).not.toHaveBeenCalled();
  rerender({ ...property, cover: { ...photos[0], version: "different" } });
  await act(async () => {});
  expect(result.current.galleryState).toBe("idle");
  expect(result.current.images).toHaveLength(1);
});
