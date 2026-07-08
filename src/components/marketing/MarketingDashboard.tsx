import { useMemo, useState } from "react";
import {
  AlertTriangle,
  MapPinned,
  Megaphone,
  Plus,
  RadioTower,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { CampaignCreateDrawer } from "@/components/marketing/CampaignCreateDrawer";
import { CampaignDetailsDrawer } from "@/components/marketing/CampaignDetailsDrawer";
import { MarketingCampaignCard } from "@/components/marketing/MarketingCampaignCard";
import { MarketingCharts } from "@/components/marketing/MarketingCharts";
import { MarketingEmptyState } from "@/components/marketing/MarketingEmptyState";
import { MarketingFilters } from "@/components/marketing/MarketingFilters";
import { MarketingKpiCards } from "@/components/marketing/MarketingKpiCards";
import { MarketingSkeleton } from "@/components/marketing/MarketingSkeleton";
import { Button } from "@/components/ui/button";
import type {
  MarketingAgencyId,
  MarketingCampaign,
  MarketingChannelFilter,
  MarketingStatusFilter,
} from "@/types/marketing";
import {
  buildMarketingSummary,
  filterMarketingCampaigns,
  formatMarketingNumber,
  normalizeMarketingCampaigns,
} from "@/services/marketing";

type AgencyFilter = MarketingAgencyId | "todas";

type MarketingDashboardProps = {
  campaigns: MarketingCampaign[];
  agency: AgencyFilter;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  canViewFinancialInsights?: boolean;
};

export function MarketingDashboard({
  campaigns,
  agency,
  isLoading = false,
  isError = false,
  errorMessage,
  canViewFinancialInsights = true,
}: MarketingDashboardProps) {
  const [statusFilter, setStatusFilter] = useState<MarketingStatusFilter>("Todas");
  const [channelFilter, setChannelFilter] = useState<MarketingChannelFilter>("Todos");
  const [search, setSearch] = useState("");
  const [selectedCampaign, setSelectedCampaign] = useState<MarketingCampaign | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdCampaigns, setCreatedCampaigns] = useState<MarketingCampaign[]>([]);

  const allCampaigns = useMemo(
    () => normalizeMarketingCampaigns([...createdCampaigns, ...campaigns]),
    [campaigns, createdCampaigns],
  );
  const hasFilters =
    statusFilter !== "Todas" || channelFilter !== "Todos" || search.trim().length > 0;
  const filteredCampaigns = useMemo(
    () =>
      filterMarketingCampaigns({
        campaigns: allCampaigns,
        status: statusFilter,
        channel: channelFilter,
        search,
      }),
    [allCampaigns, channelFilter, search, statusFilter],
  );
  const visibleCampaigns = hasFilters ? filteredCampaigns : allCampaigns;
  const summary = useMemo(() => buildMarketingSummary(visibleCampaigns), [visibleCampaigns]);
  const creationAgency: MarketingAgencyId = agency === "morar" ? "morar" : "cordial";

  function resetFilters() {
    setStatusFilter("Todas");
    setChannelFilter("Todos");
    setSearch("");
  }

  function handleCreateCampaign(campaign: MarketingCampaign) {
    setCreatedCampaigns((current) => [campaign, ...current]);
    setSelectedCampaign(campaign);
  }

  if (isLoading) return <MarketingSkeleton />;

  if (isError) {
    return (
      <section className="premium-card mx-auto max-w-2xl p-6 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-red-500/10 text-red-700">
          <AlertTriangle className="size-6" />
        </div>
        <h1 className="mt-4 text-xl font-black tracking-tight">Falha ao carregar campanhas</h1>
        <p className="mt-2 text-sm leading-relaxed text-foreground/58">
          {errorMessage ?? "Atualize a página ou tente novamente em instantes."}
        </p>
      </section>
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[88rem] space-y-5 pb-3 sm:space-y-6">
        <MarketingHeader agency={agency} summary={summary} onCreate={() => setCreateOpen(true)} />

        {!allCampaigns.length ? (
          <MarketingEmptyState
            action={
              <Button
                className="rounded-2xl bg-primary text-white"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="size-4" />
                Cadastrar campanha
              </Button>
            }
          />
        ) : (
          <>
            <MarketingKpiCards summary={summary} canViewFinancialInsights={canViewFinancialInsights} />

            <MarketingFilters
              status={statusFilter}
              channel={channelFilter}
              search={search}
              resultCount={filteredCampaigns.length}
              onStatusChange={setStatusFilter}
              onChannelChange={setChannelFilter}
              onSearchChange={setSearch}
              onReset={resetFilters}
            />

            {!visibleCampaigns.length ? (
              <MarketingEmptyState
                title="Nenhuma campanha encontrada"
                description="Ajuste a busca ou os filtros para visualizar campanhas cadastradas."
                action={
                  <Button
                    variant="outline"
                    className="rounded-2xl border-white/70 bg-white/58"
                    onClick={resetFilters}
                  >
                    Limpar filtros
                  </Button>
                }
              />
            ) : (
              <>
                <MarketingCharts campaigns={visibleCampaigns} />

                <section className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h2 className="text-lg font-black tracking-tight text-foreground">
                        Campanhas em análise
                      </h2>
                      <p className="mt-1 text-sm leading-relaxed text-foreground/56">
                        Compare investimento, entrega, conversão e sinais de atenção.
                      </p>
                    </div>
                    <span className="w-fit rounded-full bg-white/55 px-3 py-1 text-[11px] font-bold text-foreground/54">
                      {formatMarketingNumber(visibleCampaigns.length)} resultado
                      {visibleCampaigns.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                    {visibleCampaigns.map((campaign) => (
                      <MarketingCampaignCard
                        key={campaign.id}
                        campaign={campaign}
                        onOpenDetails={setSelectedCampaign}
                        canViewFinancialInsights={canViewFinancialInsights}
                      />
                    ))}
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>

      <CampaignDetailsDrawer
        campaign={selectedCampaign}
        open={selectedCampaign !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedCampaign(null);
        }}
        canViewFinancialInsights={canViewFinancialInsights}
      />

      <CampaignCreateDrawer
        open={createOpen}
        agency={creationAgency}
        onOpenChange={setCreateOpen}
        onCreate={handleCreateCampaign}
      />
    </>
  );
}

function MarketingHeader({
  agency,
  summary,
  onCreate,
}: {
  agency: AgencyFilter;
  summary: ReturnType<typeof buildMarketingSummary>;
  onCreate: () => void;
}) {
  return (
    <section className="premium-card overflow-hidden p-4 sm:p-5 lg:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/12 bg-white/45 px-3 py-1 text-[10px] font-bold text-primary shadow-sm">
            <RadioTower className="size-3.5" />
            Inteligência de campanhas
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            Marketing imobiliário
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-foreground/62 sm:text-base">
            Acompanhe campanhas, canais, entregas, cliques e geração de leads.
          </p>
        </div>

        <div className="grid min-w-0 gap-3 lg:w-[min(31rem,42vw)]">
          <div className="grid gap-2 sm:grid-cols-3">
            <HeaderPill
              icon={Megaphone}
              label="Imobiliária"
              value={getAgencyLabel(agency)}
              tone="neutral"
            />
            <HeaderPill
              icon={TrendingUp}
              label="Melhor canal"
              value={summary.bestChannel?.label ?? "Sem dados"}
              tone="success"
            />
            <HeaderPill
              icon={MapPinned}
              label="Melhor região"
              value={summary.bestLocation?.location ?? "Sem dados"}
              tone="primary"
            />
          </div>
          <Button
            type="button"
            onClick={onCreate}
            className="min-h-11 rounded-2xl bg-primary text-white shadow-[0_14px_30px_-22px_rgba(30,100,125,0.9)] transition hover:bg-primary/90 active:scale-[0.99] motion-reduce:transition-none"
          >
            <Plus className="size-4" />
            Cadastrar campanha
          </Button>
        </div>
      </div>
    </section>
  );
}

function HeaderPill({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: "primary" | "success" | "neutral";
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-700",
    neutral: "bg-slate-500/10 text-slate-600",
  }[tone];

  return (
    <div className="min-w-0 rounded-2xl bg-white/52 px-3 py-2.5 ring-1 ring-white/66">
      <p className="flex items-center gap-1 truncate text-[10px] font-bold text-foreground/45">
        <span className={`grid size-5 shrink-0 place-items-center rounded-lg ${toneClass}`}>
          <Icon className="size-3" />
        </span>
        {label}
      </p>
      <p className="mt-1 truncate text-[13px] font-black leading-tight text-foreground">{value}</p>
    </div>
  );
}

function getAgencyLabel(agency: AgencyFilter) {
  if (agency === "cordial") return "Cordial";
  if (agency === "morar") return "Morar";
  return "Todas";
}
