import { createIsomorphicFn } from "@tanstack/react-start";
import type { SiteBootstrap, SiteCatalog, SiteSearch, PublicDetail, SitePage } from "./contract";

// Public loaders deliberately do not use the authenticated serverFn middleware.
const read = createIsomorphicFn()
  .server(async (resource: string, input: unknown, _signal?: AbortSignal): Promise<unknown> => {
    const { readSite } = await import("./service.server");
    return readSite(resource, input);
  })
  .client(async (resource: string, input: unknown, signal?: AbortSignal): Promise<unknown> => {
    const q = new URLSearchParams({ input: JSON.stringify(input ?? null) });
    const response = await fetch(`/api/cordial-site/${resource}?${q}`, {
      signal,
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Não foi possível carregar as informações. Tente novamente.");
    return response.json();
  });
export const loadBootstrap = (signal?: AbortSignal) =>
  read("bootstrap", null, signal) as Promise<SiteBootstrap>;
export const loadCatalog = (search: Partial<SiteSearch>, signal?: AbortSignal) =>
  read("properties", search, signal) as Promise<SiteCatalog>;
export const loadDetail = (id: string, signal?: AbortSignal) =>
  read("detail", id, signal) as Promise<PublicDetail | null>;
export const loadPages = (kind?: string, signal?: AbortSignal) =>
  read("pages", kind, signal) as Promise<SitePage[]>;
export const loadPage = (slug: string, signal?: AbortSignal) =>
  read("page", slug, signal) as Promise<SitePage | null>;
export const loadDetailState = (id: string, signal?: AbortSignal) =>
  read("detail-state", id, signal) as Promise<"withdrawn" | "unavailable" | "missing">;
