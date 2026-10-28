import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  FileText,
  Megaphone,
  LayoutDashboard,
  Users,
} from "lucide-react";
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
import {
  changeMarketingQuery,
  marketingSearchSchema,
  type MarketingDashboardQuery,
} from "@/lib/marketing/query-state";
export type { MarketingDashboardQuery } from "@/lib/marketing/query-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAds } from "@/hooks/useAds";
import { useSession } from "@/lib/auth-mock";
import { isAdminUser } from "@/lib/access-control";
import { useMarketingActions } from "@/hooks/useMarketingActions";
import { cn } from "@/lib/utils";
import { normalizeMarketingCampaigns } from "@/services/marketing";
import {
  buildInsights,
  campaignStats,
  currentCompetence,
  dailyTrend,
  periodKpis,
  shiftCompetence,
  summaryKpis,
} from "@/services/marketing-insights";
import { useApp } from "@/store/app-store";
import type { CampaignPage } from "@/lib/marketing/marketing.functions";
import type { MarketingAgencyId, MarketingCampaign } from "@/types/marketing";
const MetaLeadsInbox = lazy(() =>
  import("./MetaLeadsInbox").then((module) => ({ default: module.MetaLeadsInbox })),
);
const MarketingReportsSection = lazy(() =>
  import("./MarketingReportsSection").then((module) => ({
    default: module.MarketingReportsSection,
  })),
);
const MetaAdWorkspace = lazy(() =>
  import("./MetaAdWorkspace").then((module) => ({ default: module.MetaAdWorkspace })),
);
type Props = {
  campaigns: MarketingCampaign[];
  agency: MarketingAgencyId | "todas";
  isLoading?: boolean;
  isError?: boolean;
  isRefreshing?: boolean;
  errorMessage?: string;
  canViewFinancialInsights?: boolean;
  query?: MarketingDashboardQuery;
  onQueryChange?: (query: MarketingDashboardQuery) => void;
  total?: number;
  pageSize?: number;
  summary?: CampaignPage["summary"];
  ranges: { current: { since: string; until: string }; previous: { since: string; until: string } };
};
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function MarketingDashboard({
  campaigns,
  agency,
  isLoading = false,
  isError = false,
  isRefreshing = false,
  errorMessage,
  canViewFinancialInsights = true,
  query,
  onQueryChange,
  total,
  pageSize = 25,
  summary,
  ranges,
}: Props) {
  const setAgency = useApp((s) => s.setAgency),
    session = useSession(),
    admin = isAdminUser(session);
  const [localQuery, setLocalQuery] = useState<MarketingDashboardQuery>(() =>
    marketingSearchSchema.parse({}),
  );
  const filters = query ?? localQuery;
  const tab = filters.area;
  const canOperate = admin || session?.perfil === "secretaria";
  const actions = useMarketingActions();
  const canCreateMeta = (["cordial", "morar"] as const).some(
    (brand) =>
      (agency === "todas" || agency === brand) &&
      actions.can("create_draft", brand) &&
      actions.can("read_ad_budget", brand),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const wizardButtonRef = useRef<HTMLButtonElement>(null);
  const [newDraftKey, setNewDraftKey] = useState(0);
  function change(patch: Partial<MarketingDashboardQuery>) {
    const next = changeMarketingQuery(filters, patch);
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
    [syncingAll, setSyncingAll] = useState(false);
  const all = useMemo(() => normalizeMarketingCampaigns(campaigns), [campaigns]);
  const ids = useMemo(
    () =>
      all
        .filter((c) => c.externalCampaignId)
        .map((c) => c.id)
        .sort(),
    [all],
  );
  const ads = useAds(ids, agency);
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
  const previousComp = shiftCompetence(filters.competence, -1);
  const stats = all
    .map((c) => campaignStats(c, filters.competence, ranges.current))
    .sort((a, b) =>
      filters.sort === "name"
        ? a.campaign.name.localeCompare(b.campaign.name, "pt-BR")
        : filters.sort === "updated"
          ? (b.campaign.lastSyncedAt ?? "").localeCompare(a.campaign.lastSyncedAt ?? "")
          : b.leads - a.leads,
    );
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
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Marketing
            </h1>
            <p className="mt-1 text-xs text-foreground/65">
              {lastSynced
                ? `Última atualização: ${new Date(lastSynced).toLocaleString("pt-BR")}`
                : "Ainda sem sincronização concluída"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {tab === "campaigns" && canCreateMeta && (
              <Button
                ref={wizardButtonRef}
                className="min-h-11"
                onClick={() => {
                  setNewDraftKey((key) => key + 1);
                  setWizardOpen(true);
                }}
              >
                <Plus className="size-4" />
                Criar anúncio na Meta
              </Button>
            )}
            {tab === "campaigns" && canOperate && (
              <Button
                ref={manualButtonRef}
                variant="outline"
                className="min-h-11"
                onClick={(event) => {
                  createReturnFocus.current = event.currentTarget;
                  setCreateOpen(true);
                }}
              >
                Registrar campanha manual
              </Button>
            )}
            {canOperate && (tab === "overview" || tab === "campaigns") && (
              <Button
                variant="ghost"
                className="min-h-11"
                onClick={() => void syncAll()}
                disabled={syncingAll || activeJobs.length > 0 || !ids.length}
              >
                <RefreshCw
                  className={cn(
                    "size-4",
                    (syncingAll || activeJobs.length > 0) &&
                      "animate-spin motion-reduce:animate-none",
                  )}
                />
                {activeJobs.length ? `${activeJobs.length} na fila` : "Atualizar dados"}
              </Button>
            )}
          </div>
        </header>
        <section className="grid grid-cols-1 gap-3 border-y border-border py-3 sm:grid-cols-2 xl:grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex items-center justify-between rounded-2xl bg-muted/60">
            <Button
              size="icon"
              variant="ghost"
              className="size-11 rounded-xl"
              aria-label="Mês anterior"
              onClick={() =>
                change({
                  competence: shiftCompetence(filters.competence, -1),
                  since: undefined,
                  until: undefined,
                })
              }
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2 font-mono text-sm font-semibold tabular-nums">
              {filters.since && filters.until ? "Personalizado" : `${MONTHS[month - 1]}/${year}`}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="size-11 rounded-xl"
              aria-label="Próximo mês"
              disabled={filters.competence >= currentCompetence()}
              onClick={() =>
                change({
                  competence: shiftCompetence(filters.competence, 1),
                  since: undefined,
                  until: undefined,
                })
              }
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <select
            aria-label="Imobiliária"
            className={cn(
              "h-11 min-w-0 rounded-xl border border-foreground/55 bg-background px-3 text-sm sm:block",
              !filtersOpen && "hidden",
            )}
            value={agency}
            onChange={(e) => {
              setAgency(e.target.value as typeof agency);
              change({ agency: e.target.value as typeof agency, page: 1, accountId: "" });
            }}
          >
            <option value="todas">Todas as imobiliárias</option>
            <option value="cordial">Cordial</option>
            <option value="morar">Morar</option>
          </select>
          <select
            aria-label="Conta de anúncios"
            className="h-11 min-w-0 rounded-2xl border border-foreground/55 bg-background px-3 text-sm"
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
          <div className={cn("min-w-0 gap-2 sm:flex", filtersOpen ? "flex" : "hidden")}>
            <select
              aria-label="Plataforma"
              className="h-11 min-w-0 flex-1 rounded-2xl border border-foreground/55 bg-background px-3 text-sm"
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
          <Button
            variant="ghost"
            className="min-h-11 sm:hidden"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal className="size-4" />
            Filtros
            {[
              filters.platform,
              filters.status,
              filters.search,
              agency !== "todas" ? agency : "",
            ].filter(Boolean).length
              ? ` (${[filters.platform, filters.status, filters.search, agency !== "todas" ? agency : ""].filter(Boolean).length})`
              : ""}
          </Button>
          <details className="sm:col-span-2 xl:col-span-4">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-semibold text-primary">
              Escolher intervalo de datas
            </summary>
            <div className="grid gap-3 py-2 sm:grid-cols-3">
              <label className="text-xs font-semibold">
                Desde
                <input
                  type="date"
                  className="mt-1.5 h-11 w-full rounded-xl border border-foreground/55 bg-card px-3 text-sm"
                  value={filters.since ?? ""}
                  max={filters.until}
                  onChange={(event) => change({ since: event.target.value || undefined })}
                />
              </label>
              <label className="text-xs font-semibold">
                Até
                <input
                  type="date"
                  className="mt-1.5 h-11 w-full rounded-xl border border-foreground/55 bg-card px-3 text-sm"
                  value={filters.until ?? ""}
                  min={filters.since}
                  onChange={(event) => change({ until: event.target.value || undefined })}
                />
              </label>
              <Button
                variant="ghost"
                className="min-h-11 self-end"
                onClick={() => change({ since: undefined, until: undefined })}
              >
                Usar mês selecionado
              </Button>
            </div>
            {filters.since &&
              filters.until &&
              (filters.until < filters.since ||
                Date.parse(filters.until) - Date.parse(filters.since) > 366 * 86400000) && (
                <p role="alert" className="pb-2 text-xs text-red-800">
                  Selecione um intervalo válido de até 367 dias. Enquanto isso, os resultados usam o
                  mês selecionado.
                </p>
              )}
          </details>
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
              Diagnóstico da integração
            </a>
          )}
        </div>
        <nav aria-label="Áreas do marketing" className="flex gap-1 rounded-2xl bg-muted/60 p-1">
          {(
            [
              ["overview", "Visão geral", LayoutDashboard],
              ["campaigns", "Campanhas", Megaphone],
              ["leads", "Leads", Users],
              ["reports", "Relatórios", FileText],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-current={tab === value ? "page" : undefined}
              onClick={() => {
                if (value === "leads" && ["google", "manual"].includes(filters.platform)) {
                  toast(
                    "Leads usa a Meta. O filtro de plataforma e a conta anterior foram ajustados.",
                  );
                  change({ area: value, platform: "meta", accountId: "" });
                } else change({ area: value });
              }}
              className={cn(
                "min-h-11 min-w-0 flex-1 rounded-lg px-1 text-xs font-semibold transition sm:px-2 sm:text-sm motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                tab === value ? "bg-card text-primary shadow-sm" : "text-foreground/65",
              )}
            >
              <Icon className="mx-auto mb-1 size-4 sm:mb-0 sm:mr-2 sm:inline" aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        {isRefreshing && (
          <p role="status" className="text-xs text-primary">
            Atualizando o recorte. Os resultados anteriores permanecem visíveis até a conclusão.
          </p>
        )}
        <Suspense fallback={<MarketingSkeleton />}>
          {tab === "leads" ? (
            <MetaLeadsInbox
              key={`${session?.id}:${session?.perfil}:${agency}`}
              agency={agency}
              accountId={filters.accountId}
              period={ranges.current}
              campaigns={all}
              extraFilters={{
                search: filters.leadSearch,
                formId: filters.leadFormId,
                campaignId: filters.leadCampaignId,
                brokerId: filters.leadBrokerId,
              }}
              onExtraFiltersChange={(patch) =>
                change({
                  ...(patch.search !== undefined ? { leadSearch: patch.search } : {}),
                  ...(patch.formId !== undefined ? { leadFormId: patch.formId } : {}),
                  ...(patch.campaignId !== undefined ? { leadCampaignId: patch.campaignId } : {}),
                  ...(patch.brokerId !== undefined ? { leadBrokerId: patch.brokerId } : {}),
                })
              }
              status={filters.leadStatus}
              page={filters.leadPage}
              onFiltersChange={(patch) =>
                change({
                  ...(patch.status !== undefined ? { leadStatus: patch.status } : {}),
                  ...(patch.page !== undefined ? { leadPage: patch.page } : {}),
                })
              }
            />
          ) : tab === "reports" ? (
            <MarketingReportsSection
              imobiliaria={agency}
              filters={{
                since: ranges.current.since,
                until: ranges.current.until,
                accountId: filters.accountId || undefined,
                platform: filters.platform || undefined,
                search: filters.search,
                status: filters.status,
              }}
            />
          ) : (
            <>
              {tab === "campaigns" && actions.isError && (
                <p className="text-sm text-red-800" role="alert">
                  Não foi possível verificar as autorizações para anúncios.{" "}
                  <button className="min-h-11 underline" onClick={() => void actions.refetch()}>
                    Tentar novamente
                  </button>
                </p>
              )}
              {tab === "campaigns" && canCreateMeta && (
                <MetaAdWorkspace
                  newDraftKey={newDraftKey}
                  range={ranges.current}
                  agency={agency}
                  connections={ads.connections}
                  open={wizardOpen}
                  onOpenChange={setWizardOpen}
                  onRestoreFocus={() => wizardButtonRef.current?.focus({ preventScroll: true })}
                />
              )}
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
                      <p className="text-xs text-foreground/65">
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
                        <div>
                          <TrendChart data={dailyTrend(all, filters.competence, ranges.current)} />
                          {Boolean(total && total > all.length) && (
                            <p className="mt-2 text-xs text-foreground/70">
                              Tendência das {all.length} campanhas nesta página. Os KPIs acima
                              cobrem o filtro completo.
                            </p>
                          )}
                        </div>
                        <InsightsBlock
                          insights={buildInsights(stats, previousStats).filter(
                            (i) => canViewFinancialInsights || !i.financial,
                          )}
                        />
                      </div>
                    </>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <DebouncedCampaignSearch
                      aria-label="Buscar campanha"
                      className="h-11 min-w-0 rounded-2xl"
                      placeholder="Buscar campanha"
                      value={filters.search}
                      onCommit={(search) => change({ search })}
                    />
                    <select
                      aria-label="Ordenação das campanhas"
                      value={filters.sort}
                      onChange={(event) =>
                        change({ sort: event.target.value as MarketingDashboardQuery["sort"] })
                      }
                      className="h-11 rounded-xl border border-foreground/55 bg-card px-3 text-sm"
                    >
                      <option value="leads">Mais leads nesta página</option>
                      <option value="name">Nome nesta página</option>
                      <option value="updated">Atualização nesta página</option>
                    </select>
                    <select
                      aria-label="Status da campanha"
                      className="h-11 rounded-2xl border border-foreground/55 bg-card px-3 text-sm sm:max-w-52"
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
                    {(filters.search ||
                      filters.platform ||
                      filters.status ||
                      filters.accountId) && (
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
                      onSync={canOperate ? (id) => void syncOne(id) : undefined}
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
              {tab === "campaigns" && canOperate && (
                <details className="border-t pt-3">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary">
                    Importar campanhas existentes
                  </summary>
                  <MarketingCampaignImport
                    ads={ads}
                    agency={agency}
                    range={ranges.current}
                    canConfigure={admin}
                  />
                </details>
              )}
              {admin && (
                <ConnectionsStrip connections={ads.connections} loading={ads.connectionsLoading} />
              )}
            </>
          )}
        </Suspense>
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
        agency={agency}
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

function DebouncedCampaignSearch({
  value,
  onCommit,
  ...props
}: {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  placeholder?: string;
  "aria-label": string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => onCommit(draft), 350);
    return () => window.clearTimeout(timer);
  }, [draft, value, onCommit]);
  return (
    <Input
      {...props}
      className={cn(props.className, "border-foreground/55 placeholder:text-foreground/65")}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onCommit(draft);
      }}
    />
  );
}
