import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useGalleryPhotos } from "../../src/components/cordial-site/useGalleryPhotos";

const mocks = vi.hoisted(() => ({ preload: vi.fn(), speculate: vi.fn() }));

vi.mock("@/lib/cordial-site/card-photo-preload", () => ({
  canSpeculatePhotos: mocks.speculate,
  preloadCardImage: mocks.preload,
}));

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const images = ["cover", "next", "last"].map((id, position) => ({
  id,
  position,
  version: "version",
  width: 960,
  height: 640,
}));
const options = { images, brand: "morar", size: "full", sizes: "500px", active: true } as const;
const renderPhotos = (initialProps = { ...options, active: true }) =>
  renderHook((props) => useGalleryPhotos(props), { initialProps });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.preload.mockResolvedValue(undefined);
  mocks.speculate.mockReturnValue(false);
});
afterEach(cleanup);

it("keeps the visible photo while decoding and commits the latest requested index", async () => {
  const first = deferred();
  const second = deferred();
  mocks.preload.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const { result } = renderPhotos();

  act(() => {
    result.current.move(1);
    result.current.move(1);
  });
  expect(result.current.current?.id).toBe("cover");
  expect(result.current.index).toBe(0);
  expect(mocks.preload.mock.calls).toEqual([
    [images[1], "morar", "500px", true, "full"],
    [images[2], "morar", "500px", true, "full"],
  ]);
  await act(async () => second.resolve());
  await act(async () => first.resolve());
  expect(result.current.current?.id).toBe("last");
  expect(result.current.index).toBe(2);
});

it("keeps the committed index when loading fails and retries the same photo", async () => {
  mocks.preload.mockRejectedValueOnce(new Error("transport"));
  const { result } = renderPhotos();
  await act(async () => result.current.goTo(2));
  expect(result.current.index).toBe(0);
  expect(result.current.pending).toEqual({ index: 2, status: "failed" });
  await act(async () => result.current.retry());
  expect(result.current.index).toBe(2);
  expect(result.current.pending).toBe(null);
});

it("ignores an old request after closing the gallery and selecting another opening photo", async () => {
  const target = deferred();
  mocks.preload.mockReturnValueOnce(target.promise);
  const { result, rerender } = renderPhotos();
  act(() => result.current.move(1));
  rerender({ ...options, active: false });
  act(() => result.current.selectImmediately(2));
  rerender({ ...options, active: true });
  await act(async () => target.resolve());
  expect(result.current.index).toBe(2);
  expect(result.current.pending).toBe(null);
});

it("warms adjacent responsive variants after the first image is visible", async () => {
  mocks.speculate.mockReturnValue(true);
  const { result } = renderPhotos();
  expect(mocks.preload).not.toHaveBeenCalled();
  await act(async () => result.current.onImageReady());
  expect(mocks.preload.mock.calls).toEqual([
    [images[1], "morar", "500px", false, "full"],
    [images[2], "morar", "500px", false, "full"],
  ]);
});
