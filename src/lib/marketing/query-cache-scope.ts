import type { MarketingQuery } from "./marketing.functions";

/** Previous data is only safe to show while the user and ad-account scope match. */
export function sameMarketingPlaceholderScope(
  previous: MarketingQuery | undefined,
  next: MarketingQuery,
): boolean {
  return Boolean(
    previous &&
    previous.imobiliaria === next.imobiliaria &&
    previous.accountId === next.accountId &&
    previous.platform === next.platform,
  );
}
