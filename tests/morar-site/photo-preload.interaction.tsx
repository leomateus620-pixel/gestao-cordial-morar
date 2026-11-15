import { afterEach, expect, it, vi } from "vitest";
import type { PublicMedia } from "../../src/lib/cordial-site/contract";

vi.mock("@/lib/cordial-site/card-gallery", () => ({
  dropSpeculativeGalleries: vi.fn(),
}));

const media = (id: string): PublicMedia => ({
  id,
  width: 960,
  height: 640,
  position: 0,
  version: "v",
});

afterEach(() => vi.unstubAllGlobals());

it("keeps a slot free for an urgent image and reuses its responsive decode", async () => {
  const { preloadCardImage, resetSpeculativeScope } =
    await import("../../src/lib/cordial-site/card-photo-preload");
  class TestImage {
    onload: () => void = () => {};
    decode = () => Promise.resolve();
    constructor() {
      downloads.push(this);
    }
  }
  const downloads: TestImage[] = [];
  vi.stubGlobal("Image", TestImage);

  const first = preloadCardImage(media("first"), "cordial", "240px");
  const queued = preloadCardImage(media("queued"), "cordial", "240px").catch((error) => error);
  expect(downloads).toHaveLength(1);
  const urgent = preloadCardImage(media("urgent"), "cordial", "240px", true);
  expect(downloads).toHaveLength(2);
  expect(downloads[0]).toMatchObject({ fetchPriority: "low" });
  expect(downloads[1]).toMatchObject({
    fetchPriority: "high",
    sizes: "240px",
    srcset: expect.stringContaining("/urgent/v/thumb 480w"),
  });
  expect(preloadCardImage(media("urgent"), "cordial", "240px", true)).toBe(urgent);
  downloads[1].onload();
  await urgent;
  expect(downloads).toHaveLength(2);
  resetSpeculativeScope("morar:results");
  expect(await queued).toBeInstanceOf(Error);
  downloads[0].onload();
  await first;
});

it("prepares all five featured cards in parallel and reserves another slot for clicks", async () => {
  const { preloadCardImage, resetSpeculativeScope } =
    await import("../../src/lib/cordial-site/card-photo-preload");
  resetSpeculativeScope("featured:concurrency");
  const downloads: any[] = [];
  class TestImage {
    onload: () => void = () => {};
    decode = () => Promise.resolve();
    naturalWidth = 480;
    naturalHeight = 320;
    constructor() {
      downloads.push(this);
    }
  }
  vi.stubGlobal("Image", TestImage);
  const tasks = [1, 2, 3, 4, 5, 6].map((n) =>
    preloadCardImage(media(`featured-${n}`), "morar", "240px", false, "card", "featured"),
  );
  expect(downloads).toHaveLength(5);
  const intent = preloadCardImage(media("intent-next"), "morar", "240px", false, "card", "intent");
  const click = preloadCardImage(media("clicked"), "morar", "240px", true);
  expect(downloads).toHaveLength(6);
  expect(downloads[5].fetchPriority).toBe("high");
  downloads[0].onload();
  downloads[1].onload();
  await tasks[0];
  await tasks[1];
  expect(downloads[6].src).toContain("intent-next");
  for (const i of [2, 3, 4, 5, 6]) downloads[i].onload();
  await tasks[2];
  await tasks[3];
  await tasks[4];
  await click;
  await intent;
  downloads[7].onload();
  await tasks[5];
});
