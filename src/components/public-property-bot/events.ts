import { readAnalyticsConsent } from "@/lib/cordial-site/analytics-consent";
import { botBrand } from "@/lib/public-property-bot/brand-config";
import type { BotBrand, Suggestion } from "@/lib/public-property-bot/contracts";
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
