import { createFileRoute } from "@tanstack/react-router";
import { marketingSearchSchema, marketingQueryRanges } from "@/lib/marketing/query-state";
import {
  MarketingDashboard,
  type MarketingDashboardQuery,
} from "@/components/marketing/MarketingDashboard";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { useMarketing } from "@/hooks/useMarketing";
import { useApp } from "@/store/app-store";
import { useSession } from "@/lib/auth-mock";
import { canSeeFinancialInsights } from "@/lib/access-control";
export const Route = createFileRoute("/_app/marketing")({
  head: () => ({ meta: [{ title: "Marketing | Gestão Cordial" }] }),
  validateSearch: (search) => marketingSearchSchema.parse(search),
  component: Page,
});
function Page() {
  return (
    <RequireModuleAccess module="marketing">
      <MarketingPageInner />
    </RequireModuleAccess>
  );
}
function MarketingPageInner() {
  const session = useSession(),
    globalAgency = useApp((state) => state.agency),
    query = Route.useSearch(),
    navigate = Route.useNavigate();
  const agency = query.agency ?? globalAgency;
  const range = marketingQueryRanges(query);
  const { campaigns, total, summary, financialVisible, isLoading, isRefreshing, isError } =
    useMarketing(
      {
        imobiliaria: agency === "todas" ? null : agency,
        since: range.previous.since,
        until: range.current.until,
        currentSince: range.current.since,
        previousUntil: range.previous.until,
        accountId: query.accountId || null,
        page: query.page,
        pageSize: 25,
        search: query.search,
        platform: query.platform || null,
        status: query.status || null,
      },
      { enabled: query.platform !== "google" },
    );
  function updateQuery(next: MarketingDashboardQuery) {
    void navigate({ search: next, replace: true });
  }
  return (
    <MarketingDashboard
      campaigns={campaigns}
      ranges={range}
      agency={agency}
      query={query}
      onQueryChange={updateQuery}
      total={total}
      summary={summary}
      pageSize={25}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      isError={isError}
      canViewFinancialInsights={
        canSeeFinancialInsights(session) && (query.platform === "google" || financialVisible)
      }
    />
  );
}
