// Closed Morar route adapter; the server still enforces object-level brand publication.
import type { SiteSearch } from "./contract";
import * as data from "./data";
export const loadBootstrap = (signal?: AbortSignal) => data.loadBootstrap(signal, "morar");
export const loadCatalog = (search: Partial<SiteSearch>, signal?: AbortSignal) =>
  data.loadCatalog(search, signal, "morar");
export const loadDetail = (id: string, signal?: AbortSignal) =>
  data.loadDetail(id, signal, "morar");
export const loadDetailState = (id: string, signal?: AbortSignal) =>
  data.loadDetailState(id, signal, "morar");
export const loadPages = (kind?: string, signal?: AbortSignal) =>
  data.loadPages(kind, signal, "morar");
export const loadPage = (slug: string, signal?: AbortSignal) =>
  data.loadPage(slug, signal, "morar");
