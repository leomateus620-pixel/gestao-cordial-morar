import { readAnalyticsConsent } from "@/lib/cordial-site/analytics-consent";
import { botBrand } from "@/lib/public-property-bot/brand-config";
import type { BotBrand, Suggestion } from "@/lib/public-property-bot/contracts";
/** Confirm only a successfully loaded opening, after the browser has received its session cookie. */
export function recordBotOpen(brand: BotBrand, eventId: string) {
  try {
    void fetch(`${botBrand(brand).api}/events`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "panel_open", eventId }),
    }).catch(() => {});
  } catch {
    /* An operational measurement never prevents opening the search interface. */
  }
}
/** Internal operational measurement. Separate from advertising/consented suggestion trends. */
export function recordBotContact(
  brand: BotBrand,
  source: "header" | "card" | "quota" | "unavailable",
  publicId: string | null = null,
) {
  try {
    void fetch(`${botBrand(brand).api}/events`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "contact_click",
        eventId: crypto.randomUUID(),
        source,
        publicId,
      }),
    }).catch(() => {});
  } catch {
    /* The voluntary contact link always works, even when measurement fails. */
  }
}
/** First-party normalized events only. Never forward conversation, audio, IDs or IP to analytics SDKs. */
export function suggestionEvent(
  brand: BotBrand,
  kind: "impression" | "search" | "open" | "whatsapp",
  suggestion: Suggestion,
) {
  try {
    if (readAnalyticsConsent(localStorage) !== "granted") return false;
    const category = suggestion.patch.features?.length
      ? "feature"
      : suggestion.patch.budget
        ? "budget"
        : suggestion.patch.district
          ? "district"
          : "type";
    void fetch(`${botBrand(brand).api}/events`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: crypto.randomUUID(),
        kind,
        category,
        suggestionId: suggestion.id,
        consent: true,
      }),
    }).catch(() => {});
    return true;
  } catch {
    /* Consent storage or analytics failure never blocks property search. */
    return false;
  }
}
