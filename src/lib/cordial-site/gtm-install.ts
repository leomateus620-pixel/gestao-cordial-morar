import { GESTAO_HOSTS, SITE_PUBLIC_HOSTS } from "./domains";
import { isGtmId } from "./meta-pixel";

/** Marker on the document-level GTM tags; client code uses it to avoid a second Google tag. */
export const GTM_MARKER = "cordial";

export function shouldInstallCordialGtm(input: {
  host: string;
  pathname: string;
  containerId: string | null | undefined;
  cordialHostOverride?: string | null;
}): boolean {
  const id = input.containerId ?? "";
  if (!isGtmId(id)) return false;
  const host = input.host.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  const path = input.pathname || "/";
  if (path === "/site-morar" || path.startsWith("/site-morar/")) return false;
  if (
    GESTAO_HOSTS.includes(host) ||
    host === SITE_PUBLIC_HOSTS.morar ||
    host === `www.${SITE_PUBLIC_HOSTS.morar}`
  )
    return false;
  const apex = SITE_PUBLIC_HOSTS.cordial;
  const allowed = new Set([apex, `www.${apex}`]);
  const override = input.cordialHostOverride?.toLowerCase().trim();
  if (override) allowed.add(override);
  return allowed.has(host);
}

/** Consent default (all denied) + official GTM loader. `id` must pass isGtmId. */
export function gtmHeadScript(id: string): string {
  if (!isGtmId(id)) return "";
  return (
    "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}" +
    "gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});" +
    "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});" +
    "var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;" +
    "j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})" +
    `(window,document,'script','dataLayer','${id}');`
  );
}

export const gtmNoscriptSrc = (id: string) =>
  `https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(id)}`;

/** True when the document already carries a Google Tag Manager tag. */
export function documentHasGtm(doc: Pick<Document, "querySelector">): boolean {
  return !!doc.querySelector(`script[data-gtm], script[src*="googletagmanager.com/gtm.js"]`);
}

type GtagWindow = { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

/** Consent Mode update for the document-level GTM; advertising always stays denied. */
export function updateGtmConsent(w: GtagWindow, granted: boolean) {
  w.dataLayer = w.dataLayer ?? [];
  w.gtag =
    w.gtag ??
    function () {
      // eslint-disable-next-line prefer-rest-params -- Google's queue consumes the arguments object.
      w.dataLayer!.push(arguments);
    };
  w.gtag("consent", "update", {
    analytics_storage: granted ? "granted" : "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
}

const ALLOWED = ["propertyId", "reference", "source", "active", "count"];
/** First-party event for the dataLayer; never a page_view. */
export function gtmEventFor(detail: Record<string, unknown>): Record<string, unknown> | null {
  const name = typeof detail.name === "string" ? detail.name : "";
  if (!/^[a-z_]{2,40}$/.test(name) || name === "page_view") return null;
  const payload = Object.fromEntries(
    Object.entries(detail).filter(
      ([k, v]) => ALLOWED.includes(k) && ["string", "boolean", "number"].includes(typeof v),
    ),
  );
  return { event: `cordial_${name}`, ...payload };
}
