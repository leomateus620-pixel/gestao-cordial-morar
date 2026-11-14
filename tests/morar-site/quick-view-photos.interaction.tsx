import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QuickView } from "../../src/components/cordial-site/QuickView";
import { SiteContext } from "../../src/lib/cordial-site/context";
import {
  emptyFacets,
  settingsSchema,
  type PublicProperty,
} from "../../src/lib/cordial-site/contract";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  preload: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: mocks.navigate }),
}));
vi.mock("../../src/components/cordial-site/PropertyCard", () => ({
  PropertyImage: ({ media, alt }: { media?: { id: string }; alt: string }) => (
    <img src={media ? `/${media.id}.jpg` : undefined} alt={alt} />
  ),
}));
vi.mock("../../src/components/cordial-site/SiteShell", () => ({
  SiteLink: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/lib/cordial-site/card-photo-preload", () => ({
  canSpeculatePhotos: () => false,
  preloadCardImage: mocks.preload,
}));

const images = ["cover", "next", "last"].map((id, position) => ({
  id,
  position,
  version: "version",
  width: 960,
  height: 640,
}));
const property = {
  id: "10000000-0000-4000-8000-000000000001",
  reference: "557",
  type: "Casa",
  district: null,
  city: null,
  areas: { construida: null, util: null, terreno: null, total: null },
  operation: "venda",
  cover: images[0],
} as PublicProperty;
const context = {
  settings: settingsSchema.parse({}),
  facets: emptyFacets,
  indexable: false,
  available: true,
  canonicalOrigin: "https://cordialimoveis.com",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.preload.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  history.replaceState(null, "", "/");
});

it("retains the restored gallery index and uses the committed image after returning to preview", async () => {
  const state = { cordialSurface: property.id, cordialSurfaceKey: "flow" };
  history.replaceState(state, "", `#galeria-${property.id}`);
  const onIndexChange = vi.fn();
  const onClose = vi.fn();
  const view = (galleryReady: boolean) => (
    <SiteContext.Provider value={context}>
      <QuickView
        property={property}
        images={galleryReady ? images : [images[0]]}
        resume
        initialIndex={2}
        galleryReady={galleryReady}
        onClose={onClose}
        onIndexChange={onIndexChange}
      />
    </SiteContext.Provider>
  );
  const { rerender } = render(view(false));
  expect(screen.getByRole("img").getAttribute("src")).toBe("/cover.jpg");
  expect(onIndexChange).not.toHaveBeenCalled();

  rerender(view(true));
  expect(screen.getByRole("img").getAttribute("src")).toBe("/last.jpg");
  expect(onIndexChange).toHaveBeenLastCalledWith(2);
  act(() => {
    history.replaceState(state, "", `#previa-${property.id}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(screen.getByRole("link", { name: /Ver ficha completa/ }).getAttribute("href")).toMatch(
    /#foto-3$/,
  );
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
  await waitFor(() => expect(screen.getByRole("img").getAttribute("src")).toBe("/cover.jpg"));
  expect(screen.getByRole("link", { name: /Ver ficha completa/ }).getAttribute("href")).toMatch(
    /#foto-1$/,
  );
});
