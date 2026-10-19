import type { PublicProperty } from "./contract";
import type { SiteBrand } from "./brand";
import { propertyPath } from "./presentation";
import { rewritePublicInput, rewritePublicOutput } from "./routing";

/** One-based URL fragment; it changes presentation only and never the canonical identity. */
export function photoIndexFromHash(hash: string, count: number): number | null {
  const match = /^#foto-(\d{1,4})$/.exec(hash);
  if (!match) return null;
  return Math.max(0, Math.min(Number(match[1]) - 1, Math.max(0, count - 1)));
}

// Only a recognized public search may become the return destination. Never trust
// history.length, a foreign referrer, or a caller-provided redirect URL.
export function searchReturnPath(input: string | null, brand: SiteBrand = "cordial") {
  const base = brand === "cordial" ? "/site" : "/site-morar";
  if (!input) return `${base}/buscar`;
  try {
    const url = new URL(input, "https://return.invalid");
    return url.origin === "https://return.invalid" && url.pathname === `${base}/buscar`
      ? `${url.pathname}${url.search}`
      : `${base}/buscar`;
  } catch {
    return `${base}/buscar`;
  }
}
export function searchNavigationContext(destination: string, source: string, brand: SiteBrand) {
  const base = brand === "cordial" ? "/site" : "/site-morar";
  const match = new RegExp(`^${base}/imovel/([a-f0-9-]{36})$`, "i").exec(destination);
  return match && searchReturnPath(source, brand) === source
    ? { brand, propertyId: match[1], path: source }
    : undefined;
}
export function readSearchOriginContext(propertyId: string, brand: SiteBrand = "cordial") {
  try {
    // Context belongs to this navigation entry, surviving reload/back but never
    // attaching an old search to a new direct/external visit of the same property.
    const value = window.history.state?.publicSiteSearch;
    return value?.brand === brand &&
      value?.propertyId === propertyId &&
      typeof value.path === "string" &&
      searchReturnPath(value.path, brand) === value.path
      ? { brand, propertyId, path: value.path as string }
      : null;
  } catch {
    return null;
  }
}
export function readSearchOrigin(propertyId: string, brand: SiteBrand = "cordial") {
  return readSearchOriginContext(propertyId, brand)?.path ?? searchReturnPath(null, brand);
}
export function rememberSearchCardOrigin(
  context: NonNullable<ReturnType<typeof searchNavigationContext>>,
  originScrollTop?: number,
) {
  try {
    window.history.replaceState(
      {
        ...window.history.state,
        publicSiteCardFocus: { ...context, top: originScrollTop ?? window.scrollY },
      },
      "",
    );
  } catch {
    /* Optional context must never block a real property link. */
  }
}
export function readSearchCardOrigin(brand: SiteBrand = "cordial", publicHost?: string) {
  try {
    const context = window.history.state?.publicSiteCardFocus;
    const browserUrl = new URL(
      window.location.pathname + window.location.search,
      window.location.origin,
    );
    const internal = rewritePublicInput(browserUrl, publicHost, brand) ?? browserUrl;
    const current = internal.pathname + internal.search;
    return context?.brand === brand &&
      typeof context.propertyId === "string" &&
      /^[a-f0-9-]{36}$/i.test(context.propertyId) &&
      context.path === current &&
      searchReturnPath(current, brand) === current
      ? (context.propertyId as string)
      : null;
  } catch {
    return null;
  }
}
export function readSearchCardScroll(brand: SiteBrand = "cordial") {
  if (!readSearchCardOrigin(brand)) return null;
  const top: unknown = window.history.state?.publicSiteCardFocus?.top;
  return typeof top === "number" && Number.isFinite(top) && top >= 0 && top < 1_000_000
    ? top
    : null;
}
export function publicSiteUrl(path: string, origin: string, brand: SiteBrand = "cordial") {
  try {
    const base = new URL(origin);
    if (!["https:", "http:"].includes(base.protocol) || base.username || base.password) return path;
    const url = new URL(path, base.origin);
    return (rewritePublicOutput(url, undefined, brand) ?? url).href;
  } catch {
    return path;
  }
}
export function propertyUrl(
  p: Pick<PublicProperty, "id">,
  origin: string,
  brand: SiteBrand = "cordial",
) {
  return publicSiteUrl(propertyPath(p, brand), origin, brand);
}
export function whatsappNumber(input: string | undefined | null) {
  const digits = input?.replace(/\D/g, "") ?? "";
  const number = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return /^55\d{10,11}$/.test(number) ? number : null;
}
export function propertyWhatsapp(p: PublicProperty, central: string, url: string) {
  const number = whatsappNumber(p.responsible?.whatsapp) ?? whatsappNumber(central);
  return number
    ? `https://wa.me/${number}?text=${encodeURIComponent(`Olá! Tenho interesse no imóvel REF ${p.reference}. ${url}`)}`
    : null;
}

export type SiteEvent =
  | "search_applied"
  | "filter_changed"
  | "property_open"
  | "gallery_open"
  | "favorite_changed"
  | "selection_changed"
  | "whatsapp_click"
  | "form_persisted";
type EventContext = {
  propertyId?: string;
  reference?: string;
  source?: string;
  active?: boolean;
  count?: number;
};
// A first-party integration seam. No remote provider or script is activated by
// this event. Analytics consumers must be configured separately and consented.
export function trackSiteEvent(name: SiteEvent, context: EventContext = {}) {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem("cordial:analytics-consent") !== "granted") return;
    const allowedNames: SiteEvent[] = [
      "search_applied",
      "filter_changed",
      "property_open",
      "gallery_open",
      "favorite_changed",
      "selection_changed",
      "whatsapp_click",
      "form_persisted",
    ];
    if (!allowedNames.includes(name)) return;
    // A field allowlist alone would still allow nested arbitrary data in a known key.
    const clean: EventContext = {};
    if (typeof context.propertyId === "string" && /^[a-f0-9-]{36}$/i.test(context.propertyId))
      clean.propertyId = context.propertyId;
    if (typeof context.reference === "string" && context.reference.length <= 80)
      clean.reference = context.reference;
    if (typeof context.source === "string" && /^[a-z0-9_:-]{1,60}$/i.test(context.source))
      clean.source = context.source;
    if (typeof context.active === "boolean") clean.active = context.active;
    if (
      typeof context.count === "number" &&
      Number.isSafeInteger(context.count) &&
      context.count >= 0
    )
      clean.count = context.count;
    const detail = { name, ...clean };
    queueMicrotask(() => {
      try {
        if (localStorage.getItem("cordial:analytics-consent") === "granted")
          window.dispatchEvent(new CustomEvent("cordial:analytics", { detail }));
      } catch {
        /* A consumer or storage failure cannot interrupt the visitor. */
      }
    });
  } catch {
    /* Metrics never block a command. */
  }
}
