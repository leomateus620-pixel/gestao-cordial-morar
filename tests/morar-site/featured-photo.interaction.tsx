import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FeaturedPhoto } from "../../src/components/cordial-site/FeaturedPhoto";
import type { PublicMedia } from "../../src/lib/cordial-site/contract";

vi.mock("../../src/components/cordial-site/PropertyCard", () => ({
  PropertyImage: ({ media, alt, className, onImageReady }: any) =>
    <img src={media.id} alt={alt} className={className} onLoad={onImageReady} />,
}));
afterEach(() => { cleanup(); vi.useRealTimers(); });
const media = (id: string) => ({ id, version: "v", position: 0, width: 480, height: 320 }) as PublicMedia;

it("retains the actual outgoing DOM image until the replacement loads and its short fade ends", () => {
  vi.useFakeTimers();
  const props = { sizes: "240px", alt: "Casa", fetchPriority: "low" as const };
  const view = render(<FeaturedPhoto {...props} media={media("cover")} />);
  const original = view.container.querySelector("img")!;
  fireEvent.load(original);
  view.rerender(<FeaturedPhoto {...props} media={media("second")} />);
  const outgoing = view.container.querySelector(".cs-featured-photo-outgoing img");
  expect(outgoing).toBe(original); // recreating it causes a lazy-load blank, even with cached bytes
  act(() => vi.advanceTimersByTime(500));
  expect(original.isConnected).toBe(true);
  fireEvent.load(view.container.querySelector(".cs-featured-photo-current")!);
  act(() => vi.advanceTimersByTime(150));
  expect(original.isConnected).toBe(false);
  expect(view.container.querySelectorAll("img")).toHaveLength(1);
});

it("a rapid next change cannot be cleared by the previous transition's timer", () => {
  vi.useFakeTimers();
  const props = { sizes: "240px", alt: "Casa", fetchPriority: "low" as const };
  const view = render(<FeaturedPhoto {...props} media={media("cover")} />);
  view.rerender(<FeaturedPhoto {...props} media={media("second")} />);
  const second = view.container.querySelector(".cs-featured-photo-current")!;
  fireEvent.load(second);
  act(() => vi.advanceTimersByTime(100));
  view.rerender(<FeaturedPhoto {...props} media={media("third")} />);
  act(() => vi.advanceTimersByTime(200));
  expect(view.container.querySelector(".cs-featured-photo-outgoing img")).toBe(second);
  expect(view.container.querySelector(".cs-featured-photo-current")?.getAttribute("src")).toBe("third");
});
