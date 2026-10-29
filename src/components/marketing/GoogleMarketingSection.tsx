import { Button } from "@/components/ui/button";
import { useGoogleMarketing } from "@/hooks/useGoogleMarketing";
import { useSession } from "@/lib/auth-mock";
import { isAdminUser } from "@/lib/access-control";
import type { MarketingDashboardQuery } from "@/lib/marketing/query-state";
import type { MarketingAgencyId } from "@/types/marketing";
import { GoogleMarketingView } from "./GoogleMarketingView";
import { googleColumnPreferenceKey } from "./google-campaign-columns";
import { GoogleMarketingSkeleton } from "./GoogleMarketingSkeleton";

export function collectionTimestamp(value: string | null, timeZone: string | null): string {
  if (!value || Number.isNaN(Date.parse(value))) return "Data da última coleta indisponível";
  let zone = timeZone || "UTC";
  let formatted: string;
  try {
    formatted = new Date(value).toLocaleString("pt-BR", { timeZone: zone });
  } catch {
    zone = "UTC";
    formatted = new Date(value).toLocaleString("pt-BR", { timeZone: zone });
  }
  return `Última coleta: ${formatted} (${zone})`;
}

export function GoogleMarketingSection({
  agency,
  filters,
  range,
  onChange,
  canViewFinancialInsights,
}: {
  agency: MarketingAgencyId | "todas";
  filters: MarketingDashboardQuery;
  range: { since: string; until: string };
  onChange: (patch: Partial<MarketingDashboardQuery>) => void;
  canViewFinancialInsights: boolean;
}) {
  const session = useSession();
  const { query, sortAllowed } = useGoogleMarketing(
    agency,
    filters,
    range,
    canViewFinancialInsights,
  );
  if (query.isLoading && !query.data)
    return (
      <GoogleMarketingSkeleton area={filters.area === "campaigns" ? "campaigns" : "overview"} />
    );
  if (!query.data)
    return (
      <section role="alert" className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Não foi possível carregar o Google Ads</h2>
        <p className="mt-2 text-sm text-foreground/70">
          Confira o acesso e tente consultar novamente.
        </p>
        <Button variant="outline" className="mt-3 min-h-11" onClick={() => void query.refetch()}>
          Tentar novamente
        </Button>
      </section>
    );
  return (
    <>
      {query.isError && (
        <section role="alert" className="mb-4 rounded-xl border bg-card p-4">
          <p className="text-sm font-semibold">
            Não foi possível atualizar. Os dados anteriores continuam disponíveis.
          </p>
          <p className="mt-1 text-sm text-foreground/70">
            {collectionTimestamp(query.data.lastCollectedAt, query.data.timezone)}.
          </p>
          <Button variant="outline" className="mt-3 min-h-11" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        </section>
      )}
      {agency !== "todas" && query.data.accounts.length === 0 && (
        <section className="mb-4 rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Nenhuma conta Google vinculada disponível neste escopo</h2>
          {isAdminUser(session) && (
            <Button asChild variant="outline" className="mt-3 min-h-11">
              <a href="/integracoes">Configurar Google Ads</a>
            </Button>
          )}
        </section>
      )}
      {!sortAllowed && (
        <p role="status" className="mb-3 text-sm text-foreground/70">
          Ordenação anterior indisponível neste escopo; a lista está ordenada por nome.
        </p>
      )}
      <GoogleMarketingView
        data={query.data}
        isRefreshing={query.isFetching && !query.isError}
        area={filters.area === "campaigns" ? "campaigns" : "overview"}
        selectedId={filters.googleCampaignId}
        onSelect={(googleCampaignId) => onChange({ googleCampaignId })}
        onPage={(page) => onChange({ page, googleCampaignId: "" })}
        onSort={(googleSort) => onChange({ googleSort, page: 1, googleCampaignId: "" })}
        canViewFinancialInsights={canViewFinancialInsights}
        preferenceKey={session?.id ? googleColumnPreferenceKey(session.id, agency) : undefined}
      />
    </>
  );
}
