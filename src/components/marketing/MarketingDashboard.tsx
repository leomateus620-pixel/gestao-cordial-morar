import { useEffect, useMemo, useRef, useState } from "react";
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
  TrendChart,
} from "@/components/marketing/MarketingAdsPanels";
import { MarketingCampaignImport } from "@/components/marketing/MarketingCampaignImport";
import { MetaLeadsInbox } from "@/components/marketing/MetaLeadsInbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAds } from "@/hooks/useAds";
import { useSession } from "@/lib/auth-mock";
import { isAdminUser } from "@/lib/access-control";
import { cn } from "@/lib/utils";
import { normalizeMarketingCampaigns } from "@/services/marketing";
import {
  buildInsights,
  campaignStats,
  comparisonRanges,
  currentCompetence,
  dailyTrend,
  periodKpis,
  shiftCompetence,
  summaryKpis,
} from "@/services/marketing-insights";
import { useApp } from "@/store/app-store";
import type { CampaignPage } from "@/lib/marketing/marketing.functions";
import type { MarketingAgencyId, MarketingCampaign } from "@/types/marketing";
export type MarketingDashboardQuery = {
  competence: string;
  search: string;
  platform: "" | "meta" | "google" | "manual";
  status: string;
  page: number;
  accountId: string;
};
type Props = {
  campaigns: MarketingCampaign[];
  agency: MarketingAgencyId | "todas";
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  canViewFinancialInsights?: boolean;
  query?: MarketingDashboardQuery;
  onQueryChange?: (query: MarketingDashboardQuery) => void;
  total?: number;
  pageSize?: number;
  summary?: CampaignPage["summary"];
};
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function MarketingDashboard({
  campaigns,
  agency,
  isLoading = false,
  isError = false,
  errorMessage,
  canViewFinancialInsights = true,
  query,
  onQueryChange,
  total,
  pageSize = 25,
  summary,
}: Props) {
  const setAgency = useApp((s) => s.setAgency),
    session = useSession(),
    admin = isAdminUser(session);
  const [localQuery, setLocalQuery] = useState<MarketingDashboardQuery>({
    competence: currentCompetence(),
    search: "",
    platform: "",
    status: "",
    page: 1,
    accountId: "",
  });
  const filters = query ?? localQuery;
  function change(patch: Partial<MarketingDashboardQuery>) {
    const next = { ...filters, page: 1, ...patch };
    setLocalQuery(next);
    onQueryChange?.(next);
  }
  const manualButtonRef = useRef<HTMLButtonElement | null>(null);
  const createReturnFocus = useRef<HTMLElement | null>(null);
  const detailsReturnFocus = useRef<HTMLElement | null>(null);
  const detailsOpenRef = useRef(false);
  function restoreFocus(trigger: HTMLElement | null) {
    const target =
      trigger?.isConnected && trigger.getClientRects().length > 0
        ? trigger
        : manualButtonRef.current;
    target?.focus({ preventScroll: true });
  }
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [createOpen, setCreateOpen] = useState(false),
    [createdCampaign, setCreatedCampaign] = useState<MarketingCampaign | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null),
    [syncingAll, setSyncingAll] = useState(false),
    [tab, setTab] = useState<"overview" | "campaigns" | "leads">("overview");
  const all = useMemo(() => normalizeMarketingCampaigns(campaigns), [campaigns]);
  const ids = useMemo(
    () =>
      all
        .filter((c) => c.externalCampaignId)
        .map((c) => c.id)
        .sort(),
    [all],
  );
  const ads = useAds(ids);
  const accountOptions = new Map<string, string>();
  for (const connection of ads.connections) {
    if (connection.accountId && (!filters.platform || connection.platform === filters.platform))
      accountOptions.set(
        connection.accountId,
        `${connection.accountLabel || connection.accountId} · ${connection.imobiliaria || "Conta vinculada"}`,
      );
  }
  for (const campaign of all) {
    if (campaign.externalAccountId && !accountOptions.has(campaign.externalAccountId))
      accountOptions.set(
        campaign.externalAccountId,
        `${campaign.imobiliaria} · Conta ${campaign.externalAccountId}`,
      );
  }
  const timezones = [...new Set(all.map((c) => c.accountTimezone).filter(Boolean))];
  const timeZone = timezones.length === 1 ? timezones[0]! : "America/Sao_Paulo";
  const ranges = comparisonRanges(filters.competence, new Date(), timeZone),
    previousComp = shiftCompetence(filters.competence, -1);
  const stats = all
    .map((c) => campaignStats(c, filters.competence, ranges.current))
    .sort((a, b) => b.leads - a.leads);
  const previousStats = all.map((c) => campaignStats(c, previousComp, ranges.previous));
  const kpis = summary ? summaryKpis(summary.current) : periodKpis(stats),
    previousKpis = summary ? summaryKpis(summary.previous) : periodKpis(previousStats);
  if (total === 1 && stats.length === 1) {
    kpis.reach = stats[0].reach;
    kpis.frequency = stats[0].frequency;
  }
  const selected =
    all.find((c) => c.id === selectedId) ??
    (createdCampaign?.id === selectedId ? createdCampaign : null);
  useEffect(() => {
    setCreatedCampaign(null);
    detailsOpenRef.current = false;
    setSelectedId(null);
  }, [agency, session?.id, session?.perfil]);
  const activeJobs = ads.jobs.filter((j: { status: string }) =>
    ["queued", "running"].includes(j.status),
  );
  const lastSynced = all
    .map((c) => c.lastSyncedAt)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("ads");
    if (status === "conectado")
      toast.success("Credencial conectada. Confira as capacidades em Integrações.");
    else if (status && status !== "cancelado")
      toast.error("A conexão precisa de revisão em Integrações.");
  }, []);
  async function syncOne(id: string) {
    setSyncingId(id);
    try {
      const r = await ads.syncCampaign({ id, range: ranges.current });
      if (r.ok) toast.success("Sincronização agendada no servidor.");
      else toast.error(r.message);
    } catch {
      toast.error("Não foi possível agendar a sincronização.");
    } finally {
      setSyncingId(null);
    }
  }
  async function syncAll() {
    if (!ids.length) {
      toast("Importe uma campanha para sincronizar seus dados.");
      return;
    }
    setSyncingAll(true);
    const results = await Promise.allSettled(
      ids.map((id) => ads.syncCampaign({ id, range: ranges.current })),
    );
    const success = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
    setSyncingAll(false);
    toast(
      success === ids.length
        ? `${success} campanha(s) na fila do servidor.`
        : `${success}/${ids.length} agendadas. Revise as conexões com falha.`,
    );
  }
  const [year, month] = filters.competence.split("-").map(Number);
  return (
    <>
      <div className="mx-auto w-full max-w-[88rem] space-y-4 pb-5 sm:space-y-5">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold text-primary">Acompanhamento de campanhas</p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Marketing
            </h1>
            <p className="mt-1 text-xs text-foreground/65">
              {lastSynced
                ? `Última atualização: ${new Date(lastSynced).toLocaleString("pt-BR")}`
                : "Ainda sem sincronização concluída"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="min-h-11 rounded-2xl"
              onClick={() => void syncAll()}
              disabled={syncingAll || activeJobs.length > 0}
            >
              <RefreshCw
                className={cn("size-4", (syncingAll || activeJobs.length > 0) && "animate-spin")}
              />
              {activeJobs.length
                ? `${activeJobs.length} na fila / em execução`
                : "Sincronizar página"}
            </Button>
            <Button
              ref={manualButtonRef}
              className="min-h-11 rounded-2xl"
              onClick={(event) => {
                createReturnFocus.current = event.currentTarget;
                setCreateOpen(true);
              }}
            >
              <Plus className="size-4" />
              Campanha manual
            </Button>
          </div>
        </header>
        <section className="grid grid-cols-1 gap-3 rounded-3xl bg-card p-3 ring-1 ring-border/60 sm:grid-cols-2 xl:grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex items-center justify-between rounded-2xl bg-muted/60">
            <Button
              size="icon"
              variant="ghost"
              className="size-11 rounded-xl"
              aria-label="Mês anterior"
              onClick={() => change({ competence: shiftCompetence(filters.competence, -1) })}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2 font-mono text-sm font-semibold tabular-nums">
              {MONTHS[month - 1]}/{year}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="size-11 rounded-xl"
              aria-label="Próximo mês"
              disabled={filters.competence >= currentCompetence()}
              onClick={() => change({ competence: shiftCompetence(filters.competence, 1) })}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <select
            aria-label="Imobiliária"
            className="h-11 min-w-0 rounded-2xl border bg-background px-3 text-sm"
            value={agency}
            onChange={(e) => {
              setAgency(e.target.value as typeof agency);
              change({ page: 1, accountId: "" });
            }}
          >
            <option value="todas">Todas as imobiliárias</option>
            <option value="cordial">Cordial</option>
            <option value="morar">Morar</option>
          </select>
          <select
            aria-label="Conta de anúncios"
            className="h-11 min-w-0 rounded-2xl border bg-background px-3 text-sm"
            value={filters.accountId}
            onChange={(e) => change({ accountId: e.target.value })}
          >
            <option value="">Todas as contas</option>
            {[...accountOptions].map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <div className="flex min-w-0 gap-2">
            <select
              aria-label="Plataforma"
              className="h-11 min-w-0 flex-1 rounded-2xl border bg-background px-3 text-sm"
              value={filters.platform}
              onChange={(e) =>
                change({ platform: e.target.value as MarketingDashboardQuery["platform"] })
              }
            >
              <option value="">Todas as plataformas</option>
              <option value="meta">Meta Ads</option>
              <option value="google">Google Ads</option>
              <option value="manual">Manuais</option>
            </select>
          </div>
        </section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-foreground/65">
            {ranges.current.since} a {ranges.current.until} · comparação com {ranges.previous.since}{" "}
            a {ranges.previous.until}
            {timezones.length === 1 ? ` · ${timeZone}` : " · calendários de cada conta"}
          </p>
          {admin && (
            <a
              href="/integracoes"
              className="inline-flex min-h-11 items-center text-xs font-semibold text-primary underline underline-offset-4"
            >
              Gerenciar integrações
            </a>
          )}
        </div>
        <nav aria-label="Áreas do marketing" className="flex gap-1 rounded-2xl bg-muted/60 p-1">
          {(
            [
              ["overview", "Visão geral"],
              ["campaigns", "Campanhas"],
              ["leads", "Leads Meta"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-current={tab === value ? "page" : undefined}
              onClick={() => setTab(value)}
              className={cn(
                "min-h-11 min-w-0 flex-1 rounded-xl px-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                tab === value ? "bg-card text-primary shadow-sm" : "text-foreground/65",
              )}
            >
              {label}
            </button>
          ))}
        </nav>
        {tab === "leads" ? (
          <MetaLeadsInbox key={agency} agency={agency} />
        ) : (
          <>
            {isLoading ? (
              <MarketingSkeleton />
            ) : isError ? (
              <div className="rounded-3xl border border-red-200 bg-card p-5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-red-800">
                  <AlertTriangle className="size-4" />
                  Não foi possível carregar as campanhas
                </h2>
                <p className="mt-2 text-sm text-foreground/65">
                  {errorMessage ||
                    "Tente atualizar a página. Se persistir, peça ao administrador para verificar as migrações e a integração."}
                </p>
              </div>
            ) : (
              <>
                {tab === "overview" && (
                  <>
                    <p className="text-xs text-foreground/60">
                      {summary
                        ? `Resultados de todas as ${total ?? 0} campanhas no filtro aplicado.`
                        : `Resultados das ${all.length} campanhas desta página${total !== undefined ? `, de ${total} encontradas` : ""}.`}{" "}
                      Alcance entre campanhas não é somado.
                    </p>
                    <KpiGrid
                      curr={kpis}
                      prev={previousKpis}
                      showFinancial={canViewFinancialInsights}
                    />
                    <div className="grid min-w-0 gap-4 xl:grid-cols-[1.6fr_1fr]">
                      <TrendChart data={dailyTrend(all, filters.competence, ranges.current)} />
                      <InsightsBlock
                        insights={buildInsights(stats, previousStats).filter(
                          (i) => canViewFinancialInsights || !i.financial,
                        )}
                      />
                    </div>
                  </>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    aria-label="Buscar campanha"
                    className="h-11 min-w-0 rounded-2xl"
                    placeholder="Buscar campanha"
                    value={filters.search}
                    onChange={(e) => change({ search: e.target.value })}
                  />
                  <select
                    aria-label="Status da campanha"
                    className="h-11 rounded-2xl border bg-card px-3 text-sm sm:max-w-52"
                    value={filters.status}
                    onChange={(e) => change({ status: e.target.value })}
                  >
                    <option value="">Todos os status</option>
                    {[
                      "Ativa",
                      "Planejada",
                      "Pausada",
                      "Encerrada",
                      "Em análise",
                      "Com baixo desempenho",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  {(filters.search || filters.platform || filters.status || filters.accountId) && (
                    <Button
                      variant="ghost"
                      className="min-h-11 shrink-0 rounded-2xl"
                      onClick={() =>
                        change({ search: "", platform: "", status: "", accountId: "" })
                      }
                    >
                      Limpar filtros
                    </Button>
                  )}
                </div>
                {all.length ? (
                  <CampaignTable
                    stats={stats}
                    showFinancial={canViewFinancialInsights}
                    syncingId={syncingId}
                    onOpen={(id, trigger) => {
                      detailsReturnFocus.current = trigger ?? manualButtonRef.current;
                      detailsOpenRef.current = true;
                      setSelectedId(id);
                    }}
                    onSync={(id) => void syncOne(id)}
                  />
                ) : (
                  <MarketingEmptyState
                    title="Nenhuma campanha neste filtro"
                    description="Importe campanhas da conta vinculada ou registre uma campanha manual para começar o acompanhamento."
                  />
                )}
                {Boolean(total && total > pageSize) && (
                  <div className="flex items-center justify-between gap-2 text-xs text-foreground/65">
                    <span>
                      {total} campanhas · página {filters.page}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-11 rounded-xl"
                        aria-label="Página anterior de campanhas"
                        disabled={filters.page <= 1}
                        onClick={() => change({ page: filters.page - 1 })}
                      >
                        <ChevronLeft className="size-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-11 rounded-xl"
                        aria-label="Próxima página de campanhas"
                        disabled={filters.page * pageSize >= (total ?? 0)}
                        onClick={() => change({ page: filters.page + 1 })}
                      >
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
            <MarketingCampaignImport
              ads={ads}
              agency={agency}
              range={ranges.current}
              canConfigure={admin}
            />
            <ConnectionsStrip connections={ads.connections} loading={ads.connectionsLoading} />
          </>
        )}
      </div>
      <CampaignDetailsDrawer
        campaign={selected}
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            detailsOpenRef.current = false;
            setSelectedId(null);
          }
        }}
        canViewFinancialInsights={canViewFinancialInsights}
        metricsRange={ranges.current}
        onRestoreFocus={() => restoreFocus(detailsReturnFocus.current)}
      />
      <CampaignCreateDrawer
        open={createOpen}
        agency={agency === "morar" ? "morar" : "cordial"}
        onOpenChange={setCreateOpen}
        onRestoreFocus={() => {
          if (!detailsOpenRef.current) restoreFocus(createReturnFocus.current);
        }}
        canViewFinancialInsights={canViewFinancialInsights}
        onCreate={(c) => {
          setCreatedCampaign(c);
          detailsReturnFocus.current = createReturnFocus.current;
          detailsOpenRef.current = true;
          setSelectedId(c.id);
        }}
      />
    </>
  );
}
