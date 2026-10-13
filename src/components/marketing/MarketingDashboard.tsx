import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { CampaignCreateDrawer } from "@/components/marketing/CampaignCreateDrawer";
import { CampaignDetailsDrawer } from "@/components/marketing/CampaignDetailsDrawer";
import { MarketingEmptyState } from "@/components/marketing/MarketingEmptyState";
import { MarketingSkeleton } from "@/components/marketing/MarketingSkeleton";
import {
  CampaignTable,
  ConnectionsStrip,
  InsightsBlock,
  KpiGrid,
  LinkImportBar,
  TrendChart,
} from "@/components/marketing/MarketingAdsPanels";
import { Button } from "@/components/ui/button";
import { useAds } from "@/hooks/useAds";
import type { AdPlatform } from "@/lib/ads/types";
import { cn } from "@/lib/utils";
import { normalizeMarketingCampaigns } from "@/services/marketing";
import {
  buildInsights,
  campaignStats,
  competenceRange,
  currentCompetence,
  dailyTrend,
  periodKpis,
  shiftCompetence,
} from "@/services/marketing-insights";
import { useApp } from "@/store/app-store";
import type { MarketingAgencyId, MarketingCampaign } from "@/types/marketing";

type AgencyFilter = MarketingAgencyId | "todas";

type MarketingDashboardProps = {
  campaigns: MarketingCampaign[];
  agency: AgencyFilter;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  canViewFinancialInsights?: boolean;
};

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function MarketingDashboard({
  campaigns,
  agency,
  isLoading = false,
  isError = false,
  errorMessage,
  canViewFinancialInsights = true,
}: MarketingDashboardProps) {
  const setAgency = useApp((s) => s.setAgency);
  const ads = useAds();
  const [competence, setCompetence] = useState(currentCompetence());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdCampaigns, setCreatedCampaigns] = useState<MarketingCampaign[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("ads");
    if (!status) return;
    if (status === "conectado") toast.success("Conta conectada.");
    else if (status !== "cancelado") toast.error("Não foi possível conectar a conta.");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const all = useMemo(
    () => normalizeMarketingCampaigns([...createdCampaigns.filter((c) => !campaigns.some((x) => x.id === c.id)), ...campaigns]),
    [campaigns, createdCampaigns],
  );
  const prevComp = shiftCompetence(competence, -1);
  const stats = useMemo(
    () => all.map((c) => campaignStats(c, competence)).sort((a, b) => b.spend - a.spend || b.leads - a.leads),
    [all, competence],
  );
  const prevStats = useMemo(() => all.map((c) => campaignStats(c, prevComp)), [all, prevComp]);
  const kpis = useMemo(() => periodKpis(stats), [stats]);
  const prevKpis = useMemo(() => periodKpis(prevStats), [prevStats]);
  const insights = useMemo(() => buildInsights(stats, prevStats), [stats, prevStats]);
  const trend = useMemo(() => dailyTrend(all, competence), [all, competence]);
  const selected = all.find((c) => c.id === selectedId) ?? null;
  const importAgency: MarketingAgencyId = agency === "morar" ? "morar" : "cordial";
  const range = competenceRange(competence);

  async function handleConnect(platform: AdPlatform) {
    const r = await ads.connect(platform, agency === "todas" ? null : agency);
    if (!r.ok) toast.error(r.message);
  }

  async function handleImport(url: string) {
    const r = await ads.importCampaign({ url, imobiliaria: importAgency, range }).catch(() => null);
    if (!r) {
      toast.error("Falha ao importar.");
      return false;
    }
    if (!r.ok) {
      toast.error(r.message);
      return false;
    }
    toast.success(`${r.name} importada · ${r.days} dia${r.days === 1 ? "" : "s"}`);
    return true;
  }

  async function syncOne(id: string, silent = false) {
    setSyncingId(id);
    try {
      const r = await ads.syncCampaign({ id, range });
      if (!silent) r.ok ? toast.success("Campanha sincronizada.") : toast.error(r.message);
      return r.ok;
    } catch {
      if (!silent) toast.error("Falha ao sincronizar.");
      return false;
    } finally {
      setSyncingId(null);
    }
  }

  async function syncAll() {
    const ids = all.filter((c) => c.externalCampaignId).map((c) => c.id);
    if (!ids.length) {
      toast("Nenhuma campanha conectada para sincronizar.");
      return;
    }
    setSyncingAll(true);
    let ok = 0;
    for (const id of ids) if (await syncOne(id, true)) ok++;
    setSyncingAll(false);
    ok === ids.length ? toast.success(`${ok} campanha(s) sincronizada(s).`) : toast.error(`${ok}/${ids.length} sincronizadas.`);
  }

  if (isLoading) return <MarketingSkeleton />;
  if (isError) {
    return (
      <section className="mx-auto max-w-xl rounded-3xl bg-card p-6 text-center ring-1 ring-border/60">
        <AlertTriangle className="mx-auto size-6 text-red-600" />
        <h1 className="mt-3 text-lg font-semibold">Falha ao carregar campanhas</h1>
        {errorMessage && <p className="mt-1 text-sm text-foreground/55">{errorMessage}</p>}
      </section>
    );
  }

  const [y, m] = competence.split("-").map(Number);
  const isCurrent = competence >= currentCompetence();
  const activeStats = stats.filter((s) => s.spend > 0 || s.leads > 0 || s.campaign.status === "Ativa");

  return (
    <>
      <div className="mx-auto w-full max-w-[88rem] space-y-4 pb-4 sm:space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Marketing</h1>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-2xl bg-card ring-1 ring-border/70">
              <button type="button" aria-label="Mês anterior" className="grid size-9 place-items-center text-foreground/60 hover:text-foreground" onClick={() => setCompetence(shiftCompetence(competence, -1))}>
                <ChevronLeft className="size-4" />
              </button>
              <span className="min-w-[5.5rem] text-center font-mono text-sm font-semibold tabular-nums">
                {MONTHS[m - 1]}/{y}
              </span>
              <button type="button" aria-label="Próximo mês" disabled={isCurrent} className="grid size-9 place-items-center text-foreground/60 hover:text-foreground disabled:opacity-30" onClick={() => setCompetence(shiftCompetence(competence, 1))}>
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className="inline-flex rounded-2xl bg-card p-0.5 text-xs font-semibold ring-1 ring-border/70">
              {(["todas", "cordial", "morar"] as const).map((a) => (
                <button key={a} type="button" onClick={() => setAgency(a)} className={cn("rounded-xl px-3 py-2 capitalize transition", agency === a ? "bg-primary text-primary-foreground" : "text-foreground/55")}>
                  {a}
                </button>
              ))}
            </div>
            <Button variant="outline" className="h-9 rounded-2xl" onClick={syncAll} disabled={syncingAll}>
              <RefreshCw className={cn("size-4", syncingAll && "animate-spin")} /> Sincronizar
            </Button>
            <Button variant="ghost" size="icon" className="size-9 rounded-2xl" aria-label="Cadastrar campanha manual" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
            </Button>
          </div>
        </header>

        <LinkImportBar onImport={handleImport} importing={ads.importing} connections={ads.connections} onConnect={handleConnect} />
        <ConnectionsStrip connections={ads.connections} loading={ads.connectionsLoading} onConnect={handleConnect} />

        {!all.length ? (
          <MarketingEmptyState
            title="Nenhuma campanha"
            description="Cole um link de campanha ou cadastre manualmente."
            action={
              <Button className="rounded-2xl" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" /> Cadastrar campanha
              </Button>
            }
          />
        ) : (
          <>
            <KpiGrid curr={kpis} prev={prevKpis} showFinancial={canViewFinancialInsights} />
            <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
              <TrendChart data={trend} />
              <InsightsBlock insights={canViewFinancialInsights ? insights : insights.filter((i) => !i.text.includes("R$"))} />
            </div>
            {activeStats.length ? (
              <CampaignTable
                stats={activeStats}
                showFinancial={canViewFinancialInsights}
                syncingId={syncingId}
                onOpen={setSelectedId}
                onSync={(id) => void syncOne(id)}
              />
            ) : (
              <div className="rounded-3xl border border-dashed p-8 text-center text-sm text-foreground/50">
                Sem campanhas nesta competência
              </div>
            )}
          </>
        )}
      </div>

      <CampaignDetailsDrawer
        campaign={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        canViewFinancialInsights={canViewFinancialInsights}
      />
      <CampaignCreateDrawer
        open={createOpen}
        agency={importAgency}
        onOpenChange={setCreateOpen}
        onCreate={(c) => {
          setCreatedCampaigns((cur) => [c, ...cur]);
          setSelectedId(c.id);
        }}
      />
    </>
  );
}
