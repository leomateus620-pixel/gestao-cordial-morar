export const ANALYTICS_CONSENT_KEY = "cordial:analytics-consent";
export type AnalyticsConsent = "granted" | "denied" | null;
export type AnalyticsCommand = (...args: unknown[]) => void;
export type AnalyticsRuntime = {
  dataLayer?: unknown[];
  gtag?: AnalyticsCommand;
  [key: string]: unknown;
};
type ConsentStorage = { getItem(key: string): string | null };
const initialized = new WeakSet<AnalyticsRuntime>();
const denied = {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
};

/** Manual metrics never carry a shared-link capability, query or fragment. */
export function analyticsPageLocation(origin: string, pathname: string) {
  try {
    const url = new URL(pathname, origin);
    const selection = /^(\/(?:site\/)?selecao)\/.+/.exec(url.pathname);
    const path = selection
      ? `${selection[1]}/compartilhada`
      : /^\/s\/.+/.test(url.pathname)
        ? "/s/compartilhada"
        : url.pathname;
    return url.origin + path;
  } catch {
    return "";
  }
}

export function readAnalyticsConsent(storage: ConsentStorage): AnalyticsConsent {
  try {
    const consent = storage.getItem(ANALYTICS_CONSENT_KEY);
    return consent === "granted" || consent === "denied" ? consent : null;
  } catch {
    return "denied";
  }
}

/** Removing a script cannot unload an already executed SDK. Disable the ID before
 * telling the SDK about a transition, so opt-out also stops automatic SDK sends.
 * See Google's privacy controls and consent-mode command lifecycle. */
export function updateAnalyticsConsent(
  runtime: AnalyticsRuntime,
  measurementId: string,
  consent: AnalyticsConsent,
): AnalyticsCommand | undefined {
  if (!/^G-[A-Z0-9]{4,20}$/.test(measurementId)) return;
  const granted = consent === "granted";
  runtime[`ga-disable-${measurementId}`] = !granted;
  // A never-consenting visitor does not need a command queue or Google script.
  if (!granted && !runtime.gtag) return;
  runtime.dataLayer ??= [];
  runtime.gtag ??= function () {
    // eslint-disable-next-line prefer-rest-params -- Google's queue explicitly consumes the arguments object.
    runtime.dataLayer!.push(arguments);
  };
  const gtag = runtime.gtag;
  try {
    if (!initialized.has(runtime)) {
      initialized.add(runtime);
      gtag("consent", "default", { ...denied });
    }
    // All later choices are updates, including a grant after revocation or after
    // React's development effect replay. Advertising remains denied throughout.
    gtag("consent", "update", {
      ...denied,
      analytics_storage: granted ? "granted" : "denied",
    });
    return gtag;
  } catch {
    // The disable flag is already applied even if a blocked SDK rejects commands.
    return;
  }
}

export function createAnalyticsStorageListener(
  runtime: AnalyticsRuntime,
  measurementId: string,
  storage: ConsentStorage,
  onChange: (consent: AnalyticsConsent) => void,
) {
  return (event: { key: string | null }) => {
    if (event.key !== ANALYTICS_CONSENT_KEY && event.key !== null) return;
    const consent = readAnalyticsConsent(storage);
    // Do this before the React update, without waiting for an effect cleanup.
    if (consent !== "granted") updateAnalyticsConsent(runtime, measurementId, consent);
    // A grant is enabled by the component only after its current configuration
    // and published privacy policy have also been checked.
    onChange(consent);
  };
}
