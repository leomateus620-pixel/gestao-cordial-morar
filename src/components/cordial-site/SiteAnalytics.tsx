import { useEffect, useState } from "react";
import { SiteLink } from "./SiteShell";
import { sitePath } from "@/lib/cordial-site/presentation";
import type { SiteBrand } from "@/lib/cordial-site/brand";
import { isGtmId, isPixelId, loadGtm, loadMetaPixel, pixelEventFor } from "@/lib/cordial-site/meta-pixel";
import type { SiteSettings } from "@/lib/cordial-site/contract";
import {
  ANALYTICS_CONSENT_KEY,
  analyticsPageLocation,
  createAnalyticsStorageListener,
  readAnalyticsConsent,
  updateAnalyticsConsent,
  type AnalyticsConsent,
  type AnalyticsRuntime,
} from "@/lib/cordial-site/analytics-consent";

const key = ANALYTICS_CONSENT_KEY;
export function SiteAnalytics({
  settings,
  brand = "cordial",
}: {
  settings: SiteSettings;
  brand?: SiteBrand;
}) {
  const [consent, setConsent] = useState<AnalyticsConsent>(null);
  const [editing, setEditing] = useState(false);
  const id = settings.analyticsMeasurementId;
  const privacyPath = sitePath("/privacidade", brand);
  const gaConfigured =
    /^G-[A-Z0-9]{4,20}$/.test(id ?? "") &&
    !!settings.privacy &&
    settings.analyticsManualEventsOnly === true;
  const pixelId = settings.metaPixelId ?? "";
  const gtmId = settings.gtmContainerId ?? "";
  const extras = !!settings.privacy && (isPixelId(pixelId) || isGtmId(gtmId));
  const configured = gaConfigured || extras;
  useEffect(() => {
    if (!extras || consent !== "granted") return;
    const w = window as never;
    const stopPixel = loadMetaPixel(w, pixelId);
    const stopGtm = loadGtm(w, gtmId);
    const onEvent = (event: Event) => {
      const mapped = pixelEventFor((event as CustomEvent<Record<string, unknown>>).detail ?? {});
      const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq;
      if (mapped && fbq && isPixelId(pixelId)) fbq("track", mapped[0], mapped[1]);
    };
    window.addEventListener("cordial:analytics", onEvent);
    return () => {
      window.removeEventListener("cordial:analytics", onEvent);
      stopPixel();
      stopGtm();
    };
  }, [extras, consent, pixelId, gtmId]);
  useEffect(() => {
    const target = window as unknown as AnalyticsRuntime;
    let listener: ((event: StorageEvent) => void) | undefined;
    try {
      setConsent(readAnalyticsConsent(localStorage));
      listener = createAnalyticsStorageListener(target, id, localStorage, setConsent);
      window.addEventListener("storage", listener);
    } catch {
      updateAnalyticsConsent(target, id, "denied");
      setConsent("denied");
    }
    return () => {
      if (listener) window.removeEventListener("storage", listener);
    };
  }, [id]);
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
        if (localStorage.getItem(key) !== "granted") return;
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
        if (localStorage.getItem(key) !== "granted") return;
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
  if (!configured) return null;
  const choose = (next: Exclude<AnalyticsConsent, null>) => {
    const target = window as unknown as AnalyticsRuntime;
    if (next === "denied") updateAnalyticsConsent(target, id, "denied");
    try {
      localStorage.setItem(key, next);
      setConsent(next);
      setEditing(false);
    } catch {
      updateAnalyticsConsent(target, id, "denied");
      setConsent("denied");
      setEditing(false);
    }
    if (next === "denied") {
      // Clear first-party GA cookies when withdrawing consent; no business state.
      document.cookie.split(";").forEach((cookie) => {
        const name = cookie.trim().split("=")[0];
        if (/^_ga(?:_|$)/.test(name)) document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
      });
    }
  };
  return (
    <>
      <button className="cs-text-link" onClick={() => setEditing(true)}>
        Preferências de métricas
      </button>
      {(consent === null || editing) && (
        <section className="cs-analytics-consent" aria-label="Preferências de métricas">
          <p>
            Podemos usar métricas de navegação para melhorar o site. Seus dados do formulário não
            são enviados às métricas.{" "}
            <SiteLink to={privacyPath}>Ler política de privacidade</SiteLink>
          </p>
          <div>
            <button className="cs-button cs-button-light" onClick={() => choose("denied")}>
              Somente essenciais
            </button>
            <button className="cs-button" onClick={() => choose("granted")}>
              Aceitar métricas
            </button>
          </div>
        </section>
      )}
    </>
  );
}
