import { getSiteBrand, type SiteBrand } from "./brand";
import { createIsomorphicFn } from "@tanstack/react-start";
import type {
  SiteBootstrap,
  SiteCatalog,
  SiteSearch,
  PublicDetail,
  SitePage,
  PublicMedia,
  PublicVideo,
  PublicTour,
  PublicSummaries,
  SiteFacets,
} from "./contract";

// Public loaders deliberately do not use the authenticated serverFn middleware.
const read = createIsomorphicFn()
  .server(
    async (
      resource: string,
      input: unknown,
      signal?: AbortSignal,
      brand: SiteBrand = "cordial",
    ): Promise<unknown> => {
      const { readSite } = await import("./service.server");
      return readSite(resource, input, brand, signal);
    },
  )
  .client(
    async (
      resource: string,
      input: unknown,
      signal?: AbortSignal,
      brand: SiteBrand = "cordial",
    ): Promise<unknown> => {
      const q = new URLSearchParams({ input: JSON.stringify(input ?? null) });
      const response = await fetch(`${getSiteBrand(brand).apiBase}/${resource}?${q}`, {
        signal,
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error("Não foi possível carregar as informações. Tente novamente.");
      return response.json();
    },
  );
export const loadBootstrap = (signal?: AbortSignal, brand: SiteBrand = "cordial") =>
  read("bootstrap", null, signal, brand) as Promise<SiteBootstrap>;
export const loadCatalog = (
  search: Partial<SiteSearch>,
  signal?: AbortSignal,
  brand: SiteBrand = "cordial",
) => read("properties", search, signal, brand) as Promise<SiteCatalog>;
export const loadDetail = (id: string, signal?: AbortSignal, brand: SiteBrand = "cordial") =>
  read("detail", id, signal, brand) as Promise<PublicDetail | null>;
export const loadCatalogCount = (
  search: Partial<SiteSearch>,
  signal?: AbortSignal,
  brand: SiteBrand = "cordial",
) => read("count", search, signal, brand) as Promise<{ total: number }>;
export const loadSummaries = (ids: string[], signal?: AbortSignal, brand: SiteBrand = "cordial") =>
  read("summaries", ids, signal, brand) as Promise<PublicSummaries>;
export const loadGallery = (id: string, signal?: AbortSignal, brand: SiteBrand = "cordial") =>
  read("gallery", id, signal, brand) as Promise<PublicMedia[]>;
export const loadFacets = (
  search: Partial<SiteSearch>,
  signal?: AbortSignal,
  brand: SiteBrand = "cordial",
) => read("facets", search, signal, brand) as Promise<SiteFacets>;
export const loadPages = (kind?: string, signal?: AbortSignal, brand: SiteBrand = "cordial") =>
  read("pages", kind, signal, brand) as Promise<SitePage[]>;
export const loadPage = (slug: string, signal?: AbortSignal, brand: SiteBrand = "cordial") =>
  read("page", slug, signal, brand) as Promise<SitePage | null>;
export const loadDetailState = (id: string, signal?: AbortSignal, brand: SiteBrand = "cordial") =>
  read("detail-state", id, signal, brand) as Promise<"withdrawn" | "unavailable" | "missing">;

export const loadVideos = (id: string, signal?: AbortSignal, brand: SiteBrand = "cordial") =>
  read("videos", id, signal, brand) as Promise<PublicVideo[]>;
export const loadTours = (id: string, signal?: AbortSignal, brand: SiteBrand = "cordial") =>
  read("tours", id, signal, brand) as Promise<PublicTour[]>;
