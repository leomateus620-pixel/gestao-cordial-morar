import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSession } from "@/lib/auth-mock";
import { getGoogleMarketingOverview } from "@/lib/marketing/google-overview.functions";
import type { MarketingDashboardQuery } from "@/lib/marketing/query-state";
import type { MarketingAgencyId } from "@/types/marketing";

export function useGoogleMarketing(
  agency: MarketingAgencyId | "todas",
  filters: MarketingDashboardQuery,
  range: { since: string; until: string },
  financial: boolean,
  enabled = true,
) {
  const session = useSession();
  const load = useServerFn(getGoogleMarketingOverview);
  const selectedSort = filters.googleSort ?? "name_asc";
  const metricSort = [
    "cost_desc",
    "impressions_desc",
    "clicks_desc",
    "conversions_desc",
    "ctr_desc",
    "cpc_desc",
    "cost_per_conversion_desc",
  ].includes(selectedSort);
  const financialSort = ["cost_desc", "cpc_desc", "cost_per_conversion_desc"].includes(
    selectedSort,
  );
  const sortAllowed =
    (!metricSort || (agency !== "todas" && Boolean(filters.accountId))) &&
    (!financialSort || financial);
  const scope = {
    agency: agency === "todas" ? null : agency,
    accountId: filters.accountId || null,
    since: range.since,
    until: range.until,
    search: filters.search,
    status: filters.status || null,
    page: filters.page,
    pageSize: 25,
    sort: sortAllowed ? selectedSort : ("name_asc" as const),
  };
  const query = useQuery({
    queryKey: ["marketing", "google-overview", session?.id, session?.perfil, scope],
    queryFn: () => load({ data: scope }),
    enabled: enabled && Boolean(session) && session?.perfil !== "meta_reviewer",
    staleTime: 30_000,
  });
  return { query, sortAllowed };
}
