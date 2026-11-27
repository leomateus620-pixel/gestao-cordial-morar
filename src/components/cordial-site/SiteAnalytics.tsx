import { useEffect, useState } from "react";
import type { SiteBrand } from "@/lib/cordial-site/brand";
import {
  isGtmId,
  isPixelId,
  loadGtm,
  pixelEventFor,
} from "@/lib/cordial-site/meta-pixel";
import { documentHasGtm, gtmEventFor, updateGtmConsent } from "@/lib/cordial-site/gtm-install";
import type { SiteSettings } from "@/lib/cordial-site/contract";
import {
  analyticsPageLocation,
  updateAnalyticsConsent,
  type AnalyticsConsent,
  type AnalyticsRuntime,
} from "@/lib/cordial-site/analytics-consent";

export function SiteAnalytics({
  settings,
  brand: _brand = "cordial",
}: {
  settings: SiteSettings;
  brand?: SiteBrand;
}) {
  // Visit measurement runs without a banner (owner decision); advertising stays denied.
  const consent: AnalyticsConsent = "granted";
  // Official GTM snippet rendered in the document (Cordial public host): it is the only Google tag.
  const [docGtm, setDocGtm] = useState(false);
  useEffect(() => setDocGtm(documentHasGtm(document)), []);
  const id = settings.analyticsMeasurementId;
  const gaConfigured =
    !docGtm &&
    /^G-[A-Z0-9]{4,20}$/.test(id ?? "") &&
    !!settings.privacy &&
    settings.analyticsManualEventsOnly === true;
  const pixelId = settings.metaPixelId ?? "";
  const gtmId = settings.gtmContainerId ?? "";
  const extras = !!settings.privacy && (isPixelId(pixelId) || isGtmId(gtmId));
  const configured = gaConfigured || extras;
  useEffect(() => {
    if (!docGtm) return;
    const w = window as unknown as { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void };
    updateGtmConsent(w, consent === "granted");
    if (consent !== "granted") return;
    const forward = (event: Event) => {
      try {
        const item = gtmEventFor((event as CustomEvent<Record<string, unknown>>).detail ?? {});
        if (item) (w.dataLayer ??= []).push(item);
      } catch {
        /* Measurement never blocks the public flow. */
      }
    };
    window.addEventListener("cordial:analytics", forward);
    return () => window.removeEventListener("cordial:analytics", forward);
  }, [docGtm, consent]);
  useEffect(() => {
    if (!extras || consent !== "granted") return;
    const w = window as never;
    // Meta Pixel (advertising) is never loaded without an explicit choice.
    const stopPixel = () => {};
    const stopGtm = docGtm ? () => {} : loadGtm(w, gtmId);
    const onEvent = (event: Event) => {
      const mapped = pixelEventFor((event as CustomEvent<Record<string, unknown>>).detail ?? {});
      void mapped;
    };
    window.addEventListener("cordial:analytics", onEvent);
    return () => {
      window.removeEventListener("cordial:analytics", onEvent);
      stopPixel();
      stopGtm();
    };
  }, [extras, consent, pixelId, gtmId, docGtm]);
  useEffect(() => {
    const target = window as unknown as AnalyticsRuntime;
    if (!gaConfigured || consent !== "granted") {
      updateAnalyticsConsent(target, id, "denied");
      return;
    }
    const gtag = updateAnalyticsConsent(target, id, "granted");
    if (!gtag) return;
    try {
      gtag("js", new Date());
      gtag("config", id, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        ignore_referrer: true,
        page_location: analyticsPageLocation(location.origin, location.pathname),
        page_referrer: "",
      });
    } catch {
      updateAnalyticsConsent(target, id, "denied");
      return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(script);
    const record = (event: Event) => {
      try {
                const detail = (event as CustomEvent<Record<string, unknown>>).detail;
        const allowed = ["propertyId", "reference", "source", "active", "count"];
        const payload = Object.fromEntries(
          Object.entries(detail).filter(
            ([name, value]) =>
              allowed.includes(name) && ["string", "boolean", "number"].includes(typeof value),
          ),
        );
        gtag("event", detail.name, {
          ...payload,
          page_location: analyticsPageLocation(location.origin, location.pathname),
          send_to: id,
        });
      } catch {
        /* Providers never block the public flow. */
      }
    };
    window.addEventListener("cordial:analytics", record);
    const vital = (event: Event) => {
      try {
                const metric = (
          event as CustomEvent<{ name: string; value: number; rating: string; viewport: string }>
        ).detail;
        if (!["CLS", "INP", "LCP", "TTFB"].includes(metric.name) || !Number.isFinite(metric.value))
          return;
        gtag("event", "web_vital", {
          metric_name: metric.name,
          value: metric.value,
          rating: metric.rating,
          viewport: metric.viewport,
          page_location: analyticsPageLocation(location.origin, location.pathname),
          send_to: id,
        });
      } catch {
        /* Optional provider. */
      }
    };
    window.addEventListener("cordial:performance", vital);
    return () => {
      window.removeEventListener("cordial:analytics", record);
      window.removeEventListener("cordial:performance", vital);
      updateAnalyticsConsent(target, id, "denied");
      script.remove();
    };
  }, [gaConfigured, consent, id]);
  void configured;
  return null;
}
