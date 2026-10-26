import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  MarketingDashboard,
  type MarketingDashboardQuery,
} from "@/components/marketing/MarketingDashboard";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { useMarketing } from "@/hooks/useMarketing";
import { useApp } from "@/store/app-store";
import { useSession } from "@/lib/auth-mock";
import { canSeeFinancialInsights } from "@/lib/access-control";
import { comparisonRanges, currentCompetence } from "@/services/marketing-insights";
const searchSchema = z.object({
  competence: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .catch(currentCompetence()),
  search: z.string().max(100).catch(""),
  platform: z.enum(["", "meta", "google", "manual"]).catch(""),
  status: z.string().max(40).catch(""),
  accountId: z
    .string()
    .regex(/^(?:[0-9]{1,80})?$/)
    .catch(""),
  page: z.coerce.number().int().min(1).max(10000).catch(1),
});
export const Route = createFileRoute("/_app/marketing")({
  head: () => ({ meta: [{ title: "Marketing | Gestão Cordial" }] }),
  validateSearch: (search) => searchSchema.parse(search),
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
    agency = useApp((state) => state.agency),
    query = Route.useSearch(),
    navigate = Route.useNavigate();
  const range = comparisonRanges(query.competence);
  const { campaigns, total, summary, financialVisible, isLoading, isError } = useMarketing({
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
  });
  function updateQuery(next: MarketingDashboardQuery) {
    void navigate({ search: next, replace: true });
  }
  return (
    <MarketingDashboard
      campaigns={campaigns}
      agency={agency}
      query={query}
      onQueryChange={updateQuery}
      total={total}
      summary={summary}
      pageSize={25}
      isLoading={isLoading}
      isError={isError}
      canViewFinancialInsights={canSeeFinancialInsights(session) && financialVisible}
    />
  );
}
