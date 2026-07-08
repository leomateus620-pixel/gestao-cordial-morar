import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { MarketingDashboard } from "@/components/marketing/MarketingDashboard";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { useMarketing } from "@/hooks/useMarketing";
import { useApp } from "@/store/app-store";
import { useSession } from "@/lib/auth-mock";
import { canSeeFinancialInsights } from "@/lib/access-control";

export const Route = createFileRoute("/_app/marketing")({
  head: () => ({ meta: [{ title: "Marketing | Gestão Cordial" }] }),
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
  const session = useSession();
  const canViewFinancialInsights = canSeeFinancialInsights(session);
  const agency = useApp((state) => state.agency);
  const { campaigns, isLoading, isError } = useMarketing();

  const filtered = useMemo(() => {
    if (agency === "todas") return campaigns;
    return campaigns.filter((c) => c.imobiliaria === agency);
  }, [campaigns, agency]);

  if (isLoading) {
    return (
      <div className="glass-panel rounded-3xl p-8 text-sm text-foreground/60">
        Carregando campanhas...
      </div>
    );
  }
  if (isError) {
    return (
      <div className="glass-panel rounded-3xl p-8 text-sm text-red-600">
        Não foi possível carregar as campanhas de marketing.
      </div>
    );
  }

  return (
    <MarketingDashboard
      campaigns={filtered}
      agency={agency}
      canViewFinancialInsights={canViewFinancialInsights}
    />
  );
}
