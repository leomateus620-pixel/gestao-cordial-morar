import type { PublicDetail, SiteBootstrap } from "./contract";
import * as seo from "./seo";
export const siteMatchData = (matches: readonly { routeId: string; loaderData?: unknown }[]) =>
  seo.siteMatchData(matches, "morar");
export const siteHead = (
  title: string,
  description: string,
  data?: SiteBootstrap,
  path = "/site-morar/",
  noindex = false,
  image?: string,
) => seo.siteHead(title, description, data, path, noindex, image, "morar");
export const detailHead = (property: PublicDetail, data?: SiteBootstrap) =>
  seo.detailHead(property, data, "morar");
export const listingJsonLd = (property: PublicDetail, origin: string) =>
  seo.listingJsonLd(property, origin, "morar");
