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
  MoreHorizontal,
  X,
  Upload,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { CampaignCreateDrawer } from "@/components/marketing/CampaignCreateDrawer";
import { CampaignDetailsDrawer } from "@/components/marketing/CampaignDetailsDrawer";
import { MarketingEmptyState } from "@/components/marketing/MarketingEmptyState";
import { MarketingSkeleton } from "@/components/marketing/MarketingSkeleton";
import {
  CampaignTable,
  InsightsBlock,
  KpiGrid,
  TrendChart,
} from "@/components/marketing/MarketingAdsPanels";
import { MarketingPeriodControl } from "./MarketingPeriodControl";
import { MarketingSearchSelect } from "./MarketingSearchSelect";
import { useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  changeMarketingQuery,
  marketingSearchSchema,
  type MarketingDashboardQuery,
} from "@/lib/marketing/query-state";
export type { MarketingDashboardQuery } from "@/lib/marketing/query-state";
import { Button } from "@/components/ui/button";
import { useAds } from "@/hooks/useAds";
import { useSession } from "@/lib/auth-mock";
import { isAdminUser } from "@/lib/access-control";
import { useMarketingActions } from "@/hooks/useMarketingActions";
import { cn } from "@/lib/utils";
import { normalizeMarketingCampaigns } from "@/services/marketing";
import {
  buildInsights,
  campaignStats,
  dailyTrend,
  periodKpis,
  shiftCompetence,
  summaryKpis,
} from "@/services/marketing-insights";
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
const MarketingCampaignImport = lazy(() =>
  import("./MarketingCampaignImport").then((module) => ({
    default: module.MarketingCampaignImport,
  })),
);
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
  const session = useSession(),
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
  const [contextToolbarTarget, setContextToolbarTarget] = useState<HTMLDivElement | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const scopeButtonRef = useRef<HTMLButtonElement>(null);
  const qc = useQueryClient();
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
    if (
      campaign.externalAccountId &&
      !accountOptions.has(campaign.externalAccountId) &&
      (!filters.platform || campaign.platform === filters.platform)
    )
      accountOptions.set(
        campaign.externalAccountId,
        `${campaign.imobiliaria} · Conta ${campaign.externalAccountId}`,
      );
  }
  const timeZone = "America/Sao_Paulo";
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
  }, [agency, filters.accountId, filters.platform, session?.id, session?.perfil]);
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
  const campaignArea = tab === "overview" || tab === "campaigns";
  const clearCampaignFilters = () => change({ search: "", status: "" });
  const scopeControls = (
    <>
      <MarketingSearchSelect
        label="Conta de anúncios"
        value={filters.accountId}
        placeholder="Todas as contas"
        options={[
          { value: "", label: "Todas as contas" },
          ...[...accountOptions].map(([value, label]) => ({ value, label })),
        ]}
        onValueChange={(accountId) => change({ accountId })}
        className="w-full sm:w-48"
      />
      <Select
        value={filters.platform || "all"}
        onValueChange={(value) =>
          change({
            platform: (value === "all" ? "" : value) as MarketingDashboardQuery["platform"],
            accountId: "",
          })
        }
      >
        <SelectTrigger
          aria-label="Plataforma"
          className="h-11 w-full min-w-0 rounded-xl bg-card sm:h-10 sm:w-44"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Plataformas: todas</SelectItem>
          <SelectItem value="meta">Meta Ads</SelectItem>
          <SelectItem value="google">Google Ads</SelectItem>
          <SelectItem value="manual">Manuais</SelectItem>
        </SelectContent>
      </Select>
    </>
  );
  const campaignToolbar = (inPanel = false) => (
    <div
      className={cn("min-w-0 flex-wrap items-center gap-2", inPanel ? "flex" : "hidden sm:flex")}
      aria-label="Filtros de campanhas"
    >
      <Select
        value={filters.status || "all"}
        onValueChange={(status) => change({ status: status === "all" ? "" : status })}
      >
        <SelectTrigger
          aria-label="Status da campanha"
          className="h-11 w-auto min-w-36 gap-2 rounded-xl bg-card text-sm sm:h-10"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Status: todos</SelectItem>
          {["Ativa", "Planejada", "Pausada", "Encerrada", "Em análise", "Com baixo desempenho"].map(
            (value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-11 rounded-xl bg-card sm:h-10">
            <SlidersHorizontal className="size-4" />
            Opções
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 rounded-xl space-y-3">
          <p className="text-sm font-semibold">Ordenar a página atual</p>
          <Select
            value={filters.sort}
            onValueChange={(sort) => change({ sort: sort as MarketingDashboardQuery["sort"] })}
          >
            <SelectTrigger aria-label="Ordenação das campanhas" className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="leads">Mais leads nesta página</SelectItem>
              <SelectItem value="name">Nome nesta página</SelectItem>
              <SelectItem value="updated">Atualização nesta página</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-foreground/70">
            A ordenação abrange até {pageSize} campanhas carregadas. Os indicadores usam o filtro
            completo quando disponível.
          </p>
        </PopoverContent>
      </Popover>
      {(filters.search || filters.status) && (
        <Button
          variant="ghost"
          className="h-11 px-2 text-xs sm:h-10"
          onClick={clearCampaignFilters}
        >
          Limpar filtros
        </Button>
      )}
    </div>
  );
  return (
    <>
      <div className="mx-auto w-full max-w-[88rem] space-y-4 pb-5 sm:space-y-5">
        <header
          data-marketing-header
          className="relative space-y-3 rounded-2xl border border-border/70 bg-card/95 p-3 sm:p-4"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="mr-1 shrink-0 font-display text-2xl font-semibold tracking-tight sm:text-[28px]">
              Marketing
            </h1>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <MarketingPeriodControl
                query={filters}
                ranges={ranges}
                onChange={change}
                timeZone={timeZone}
              />
            </div>
            <div className="hidden min-w-0 flex-wrap items-center gap-2 md:flex">
              {scopeControls}
            </div>
            {campaignArea && campaignToolbar()}
          </div>
          <div
            ref={setContextToolbarTarget}
            className="empty:hidden"
            data-marketing-context-toolbar
          />
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <nav
              aria-label="Áreas do marketing"
              className="grid w-full min-w-0 grid-cols-4 gap-1 rounded-xl bg-muted/60 p-1 lg:w-auto"
            >
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
                  onClick={() => change({ area: value })}
                  className={cn(
                    "flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-10 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm motion-reduce:transition-none",
                    tab === value ? "bg-card text-primary shadow-sm" : "text-foreground/70",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {tab === "campaigns" &&
                canCreateMeta &&
                (!filters.platform || filters.platform === "meta") && (
                  <Button
                    ref={wizardButtonRef}
                    className="h-11 rounded-xl sm:h-10"
                    onClick={() => {
                      setNewDraftKey((key) => key + 1);
                      setWizardOpen(true);
                    }}
                  >
                    <Plus className="size-4" />
                    Criar anúncio na Meta
                  </Button>
                )}{" "}
              <div className="absolute right-3 top-3 ml-auto flex shrink-0 items-center gap-1 sm:static">
                <Button
                  variant="outline"
                  ref={scopeButtonRef}
                  aria-label="Escopo de Marketing"
                  className="h-11 rounded-xl md:hidden"
                  onClick={() => setFiltersOpen(true)}
                >
                  <SlidersHorizontal className="size-4" />
                  <span className="hidden min-[400px]:inline">Escopo</span>
                </Button>
                {campaignArea && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 rounded-xl sm:size-10"
                    aria-label="Reconsultar campanhas salvas"
                    title={
                      lastSynced
                        ? `Reconsultar dados salvos. Última sincronização: ${new Date(lastSynced).toLocaleString("pt-BR")}`
                        : "Reconsultar dados salvos. Sem sincronização concluída."
                    }
                    disabled={isRefreshing}
                    onClick={() =>
                      void qc.invalidateQueries({ queryKey: ["marketing", "campaigns"] })
                    }
                  >
                    <RefreshCw
                      className={cn(
                        "size-4",
                        isRefreshing && "animate-spin motion-reduce:animate-none",
                      )}
                    />
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      ref={manualButtonRef}
                      variant="ghost"
                      size="icon"
                      className="size-11 rounded-xl sm:size-10"
                      aria-label="Mais ações de Marketing"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)]">
                    <DropdownMenuLabel>Ações de Marketing</DropdownMenuLabel>
                    {campaignArea && canOperate && (
                      <DropdownMenuItem
                        disabled={syncingAll || activeJobs.length > 0 || !ids.length}
                        onSelect={() => void syncAll()}
                      >
                        <RefreshCw className="size-4" />
                        {activeJobs.length
                          ? `${activeJobs.length} sincronizações na fila`
                          : `Sincronizar ${ids.length} campanhas desta página`}
                      </DropdownMenuItem>
                    )}
                    {campaignArea && canOperate && (
                      <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                        <Upload className="size-4" />
                        Importar campanhas existentes
                      </DropdownMenuItem>
                    )}
                    {tab === "campaigns" && canOperate && (
                      <DropdownMenuItem
                        onSelect={() => {
                          createReturnFocus.current = manualButtonRef.current;
                          setCreateOpen(true);
                        }}
                      >
                        <Plus className="size-4" />
                        Registrar campanha manual
                      </DropdownMenuItem>
                    )}
                    {admin && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <a href="/integracoes">
                            <Settings2 className="size-4" />
                            Configurações · Integrações
                          </a>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="max-w-72 whitespace-normal text-xs font-normal text-foreground/70">
                      {lastSynced
                        ? `Última sincronização: ${new Date(lastSynced).toLocaleString("pt-BR")}`
                        : "Ainda sem sincronização concluída"}
                    </DropdownMenuLabel>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
          {campaignArea && (filters.search || filters.status) && (
            <div className="flex flex-wrap gap-2" aria-label="Filtros de campanhas ativos">
              {(
                [
                  ["search", filters.search],
                  ["status", filters.status],
                ] as const
              )
                .filter(([, value]) => value)
                .map(([key, value]) => (
                  <Button
                    key={key}
                    variant="secondary"
                    size="sm"
                    className="h-auto min-h-8 max-w-full gap-2 rounded-lg py-1 text-xs"
                    onClick={() => change({ [key]: "" })}
                    aria-label={`Remover filtro ${key === "search" ? "busca" : "status"}: ${value}`}
                  >
                    <span className="min-w-0 truncate">
                      {key === "search" ? `Busca: ${value}` : value}
                    </span>
                    <X className="size-3 shrink-0" />
                  </Button>
                ))}
            </div>
          )}
          {activeJobs.length > 0 && campaignArea && (
            <p role="status" className="text-xs text-primary">
              {activeJobs.length} sincronização(ões) na fila. Os dados serão atualizados ao
              concluir.
            </p>
          )}
        </header>
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent
            className="w-full max-w-sm overflow-y-auto bg-card"
            closeLabel="Fechar filtros"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              scopeButtonRef.current?.focus({ preventScroll: true });
            }}
          >
            <SheetHeader>
              <SheetTitle>Escopo de Marketing</SheetTitle>
              <SheetDescription>
                Conta e plataforma para a área selecionada. A imobiliária é definida no topo do
                sistema.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-5 flex flex-col gap-3">{scopeControls}</div>
            {campaignArea && <div className="mt-5 sm:hidden">{campaignToolbar(true)}</div>}
            <Button className="mt-5 w-full" onClick={() => setFiltersOpen(false)}>
              Concluir
            </Button>
          </SheetContent>
        </Sheet>
        <Sheet open={importOpen && canOperate} onOpenChange={setImportOpen}>
          <SheetContent
            className="w-full max-w-full overflow-y-auto bg-card sm:max-w-xl"
            closeLabel="Fechar importação"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              restoreFocus(manualButtonRef.current);
            }}
          >
            <SheetHeader>
              <SheetTitle>Importar campanhas existentes</SheetTitle>
              <SheetDescription>
                Escolha campanhas da conta vinculada para acompanhar no Gestão.
              </SheetDescription>
            </SheetHeader>
            {importOpen && canOperate && (
              <Suspense
                fallback={
                  <p className="mt-4 text-sm" role="status">
                    Carregando importação…
                  </p>
                }
              >
                <MarketingCampaignImport
                  ads={ads}
                  agency={agency}
                  range={ranges.current}
                  canConfigure={admin}
                />
              </Suspense>
            )}
          </SheetContent>
        </Sheet>
        {isRefreshing && (
          <p role="status" className="text-xs text-primary">
            Consultando o recorte selecionado…
          </p>
        )}
        <Suspense fallback={<MarketingSkeleton />}>
          {tab === "leads" && (filters.platform === "google" || filters.platform === "manual") ? (
            <section className="rounded-xl border bg-card p-6" aria-labelledby="lead-origin-title">
              <h2 id="lead-origin-title" className="text-lg font-semibold">
                {filters.platform === "google"
                  ? "Leads do Google Ads"
                  : "Leads de campanhas manuais"}
              </h2>
              <p className="mt-2 text-sm text-foreground/70">
                {filters.platform === "google"
                  ? "A importação de formulários Google para o CRM ainda não está disponível."
                  : "Esta origem ainda não possui uma caixa de submissões neste painel."}
              </p>
            </section>
          ) : tab === "leads" && !filters.platform && filters.accountId ? (
            <section className="rounded-xl border bg-card p-6" aria-labelledby="lead-scope-title">
              <h2 id="lead-scope-title" className="text-lg font-semibold">
                Selecione a plataforma
              </h2>
              <p className="mt-2 text-sm text-foreground/70">
                Escolha Meta Ads ou Google Ads para identificar a origem da conta antes de consultar
                leads.
              </p>
            </section>
          ) : tab === "leads" ? (
            <>
              {!filters.platform && (
                <p className="mb-3 text-sm text-foreground/70">
                  Exibindo submissões da Meta. A importação de formulários Google ainda não está
                  disponível.
                </p>
              )}
              <MetaLeadsInbox
                key={`${session?.id}:${session?.perfil}:${agency}`}
                agency={agency}
                toolbarTarget={contextToolbarTarget}
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
                onClearFilters={() =>
                  change({
                    leadStatus: "",
                    leadSearch: "",
                    leadFormId: "",
                    leadCampaignId: "",
                    leadBrokerId: "",
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
            </>
          ) : filters.platform === "google" ? (
            <section className="rounded-xl border bg-card p-6" aria-labelledby="google-data-title">
              <h2 id="google-data-title" className="text-lg font-semibold">
                Google Ads
              </h2>
              <p className="mt-2 text-sm text-foreground/70">
                {tab === "reports"
                  ? "Os relatórios Google ainda não estão disponíveis."
                  : "A visualização de métricas Google ainda não está disponível."}
              </p>
              {admin && (
                <Button asChild variant="outline" className="mt-4 min-h-11">
                  <a href="/integracoes">Configurar Google Ads</a>
                </Button>
              )}
            </section>
          ) : tab === "reports" ? (
            <MarketingReportsSection
              toolbarTarget={contextToolbarTarget}
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
                <div role="alert" className="rounded-xl border border-red-200 bg-card p-4">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-red-800">
                    <AlertTriangle className="size-4" />
                    Não foi possível carregar as campanhas
                  </h2>
                  <p className="mt-2 text-sm text-foreground/65">
                    {errorMessage || "Tente consultar o período novamente."}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() =>
                      void qc.invalidateQueries({ queryKey: ["marketing", "campaigns"] })
                    }
                  >
                    Tentar novamente
                  </Button>
                </div>
              ) : (
                <>
                  {tab === "overview" && (
                    <>
                      <KpiGrid
                        curr={kpis}
                        prev={previousKpis}
                        showFinancial={canViewFinancialInsights}
                        showScopeLabel={Boolean(total && total > all.length)}
                        scopeLabel={
                          summary
                            ? `Filtro completo · ${total ?? all.length} campanhas`
                            : `Página atual · ${all.length} campanhas`
                        }
                      />
                      <TrendChart
                        data={dailyTrend(all, filters.competence, ranges.current)}
                        previousData={dailyTrend(all, previousComp, ranges.previous)}
                        ranges={ranges}
                        showFinancial={canViewFinancialInsights}
                        currency={kpis.currency}
                        campaignCount={all.length}
                      />
                      <InsightsBlock
                        insights={buildInsights(stats, previousStats).filter(
                          (i) => canViewFinancialInsights || !i.financial,
                        )}
                      />
                    </>
                  )}
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
                      description="Ajuste a busca ou os filtros para encontrar campanhas."
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
