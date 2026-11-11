/** Meta Pixel and GTM loaders. Called only after the visitor granted consent; never sends PII. */
type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string; callMethod?: (...a: unknown[]) => void; push?: unknown };
type PixelWindow = Window & { fbq?: Fbq; _fbq?: Fbq; dataLayer?: unknown[] };

export const isPixelId = (id: string) => /^\d{10,20}$/.test(id);
export const isGtmId = (id: string) => /^GTM-[A-Z0-9]{4,10}$/.test(id);

/** Maps site events to Pixel standard events with only reference/type, never contact data. */
export function pixelEventFor(detail: Record<string, unknown>): [string, Record<string, string>] | null {
  const ref = typeof detail.reference === "string" ? detail.reference : undefined;
  if (detail.name === "property_open") return ["ViewContent", ref ? { content_ids: ref } as never : {}];
  if (detail.name === "form_persisted") return ["Lead", {}];
  return null;
}

export function loadMetaPixel(w: PixelWindow, id: string): () => void {
  if (!isPixelId(id)) return () => {};
  if (!w.fbq) {
    const fbq: Fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue!.push(args);
    } as Fbq;
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.push = fbq;
    w.fbq = fbq;
    w._fbq = fbq;
    const s = w.document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    s.dataset.sitePixel = "1";
    w.document.head.appendChild(s);
  }
  w.fbq!("consent", "grant");
  w.fbq!("init", id);
  w.fbq!("track", "PageView");
  return () => w.fbq?.("consent", "revoke");
}

export function loadGtm(w: PixelWindow, id: string): () => void {
  if (!isGtmId(id)) return () => {};
  w.dataLayer = w.dataLayer ?? [];
  w.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
  const s = w.document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
  w.document.head.appendChild(s);
  return () => s.remove();
}
