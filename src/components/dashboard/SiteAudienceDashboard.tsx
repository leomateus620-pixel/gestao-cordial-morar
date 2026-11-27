import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  Layers3,
  ListFilter,
  MousePointer2,
  Radio,
  ScanEye,
  ShieldOff,
  Users,
  Waypoints,
} from "lucide-react";
import { useId, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSiteBrand, type SiteBrand } from "@/lib/cordial-site/brand";
import { SITE_PUBLIC_HOSTS } from "@/lib/cordial-site/domains";
import {
  MAX_AUDIENCE_OFFSET,
  type AudiencePeriod,
  type AudiencePropertyOrder,
  type AudienceReport,
  type AudienceReportInput,
} from "@/lib/site-audience/report";
import {
  AudienceOrigins,
  AudienceRankings,
  AudienceTraffic,
  FeaturedProperty,
  NavigationBehavior,
  PropertyRanking,
} from "./SiteAudiencePanels";
import { formatAudienceDate, formatAudienceRange, n } from "./site-audience-format";
import "./site-audience.css";

const actionLabels: Record<string, string> = {
  menu_click: "Cliques em menus",
  property_click: "Cliques em imóveis",
  search: "Buscas realizadas",
  quick_view: "Prévias rápidas",
  gallery_open: "Aberturas de galeria",
  favorite_change: "Alterações nos favoritos",
  selection_change: "Alterações na seleção",
  whatsapp_click: "Cliques no WhatsApp",
  phone_click: "Cliques no telefone",
  email_click: "Cliques no e-mail",
  form_received: "Formulários recebidos",
};
const periodChoices = [
  { value: "day", label: "Dia", icon: Calendar },
  { value: "week", label: "Semana", icon: CalendarRange },
  { value: "month", label: "Mês", icon: CalendarDays },
] as const;

const metrics = [
  { key: "visitors", label: "Visitantes medidos", icon: Users },
  { key: "sessions", label: "Sessões", icon: Layers3 },
  { key: "views", label: "Visualizações", icon: ScanEye },
] as const;

type ReportLoader = (input: AudienceReportInput) => Promise<AudienceReport>;

function useAudienceReport(
  scope: string,
  input: AudienceReportInput,
  loadReport: ReportLoader,
  enabled = true,
) {
  const query = useQuery({
    queryKey: ["site-audience", scope, input.brand, input.period, input.offset, input.view],
    queryFn: () => loadReport(input),
    enabled,
    staleTime: 15_000,
    refetchInterval: enabled && input.offset === 0 ? 20_000 : false,
    retry: false,
  });
  const data = query.data;
  const report =
    data?.status === "unauthorized" ||
    (data?.brand === input.brand &&
      data.period === input.period &&
      data.offset === input.offset &&
      (data.status !== "ready" || data.view === input.view))
      ? data
      : undefined;
  const error = query.error as { status?: number; statusCode?: number } | null;
  const unauthorized =
    error?.status === 401 ||
    error?.status === 403 ||
    error?.statusCode === 401 ||
    error?.statusCode === 403;

  return {
    report: unauthorized ? { status: "unauthorized" as const } : report,
    failed: !unauthorized && (query.isError || (data !== undefined && !report)),
    refresh: () => void query.refetch(),
  };
}

type ReportResource = ReturnType<typeof useAudienceReport>;

export function SiteAudienceDashboard({
  scope,
  loadReport,
  brands,
}: {
  scope: string;
  loadReport: ReportLoader;
  brands: readonly [SiteBrand, ...SiteBrand[]];
}) {
  const titleId = useId();
  const [brand, setBrand] = useState<SiteBrand>(brands[0]);
  const [period, setPeriod] = useState<AudiencePeriod>("week");
  const [offset, setOffset] = useState(0);
  const [tab, setTab] = useState<"overview" | "origins">("overview");
  const [chosenOrder, setOrder] = useState<AudiencePropertyOrder | null>(null);
  const input = { brand, period, offset };
  const overviewResource = useAudienceReport(scope, { ...input, view: "overview" }, loadReport);
  const originsResource = useAudienceReport(
    scope,
    { ...input, view: "origins" },
    loadReport,
    tab === "origins",
  );
  const report = overviewResource.report;
  const metadata = report?.status === "unauthorized" ? undefined : report;
  const overview =
    report?.status === "ready" && report.view === "overview" ? report.overview : undefined;
  const snapshotResource = useAudienceReport(
    scope,
    { brand, period: "week", offset: 0, view: "overview" },
    loadReport,
    report?.status === "unavailable" && (period !== "week" || offset > 0),
  );
  const snapshotReport = snapshotResource.report;
  const snapshots =
    overview ??
    (report?.status !== "unauthorized" &&
    snapshotReport?.status === "ready" &&
    snapshotReport.view === "overview"
      ? snapshotReport.overview
      : undefined);
  const host = SITE_PUBLIC_HOSTS[brand];
  const selectedPeriod = periodChoices.find((choice) => choice.value === period)!;
  const order = chosenOrder ?? (overview?.properties.clicks.length ? "clicks" : "views");
  const ranked = overview?.properties[order] ?? [];

  return (
    <section className="site-audience" data-brand={brand} aria-labelledby={titleId}>
      <Tabs
        value={brand}
        onValueChange={(value) => setBrand(value as SiteBrand)}
        activationMode="manual"
      >
        <div className="sa-header">
          <div className="sa-heading">
            <h2 id={titleId}>Audiência dos sites</h2>
            <p className="sa-snapshots" aria-label="Resumo de sessões da marca">
              <strong>{n(snapshots?.today?.sessions)}</strong>{" "}
              {snapshots?.today?.sessions === 1 ? "sessão" : "sessões"} hoje
              <span aria-hidden="true"> · </span>
              <strong>{n(snapshots?.week?.sessions)}</strong> nesta semana
            </p>
          </div>
          <TabsList className="sa-brand-list" aria-label="Imobiliária">
            {brands.map((id) => {
              const info = getSiteBrand(id);
              return (
                <TabsTrigger
                  key={id}
                  value={id}
                  className="sa-brand-choice"
                  data-choice={id}
                  title={SITE_PUBLIC_HOSTS[id]}
                  aria-label={info.name}
                >
                  <img
                    alt=""
                    width={34}
                    height={34}
                    src={
                      id === "cordial" ? "/cordial-site/icon-192.png" : "/morar-site/icon-192.png"
                    }
                  />
                  <span>
                    <span className="sa-brand-name">{info.shortName}</span>
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
          <a
            href={`https://${host}/`}
            className="sa-action sa-open-site"
            title={host}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir site ${getSiteBrand(brand).name} em nova aba`}
          >
            <ExternalLink aria-hidden="true" />
            <span>Abrir site</span>
          </a>
        </div>
        <TabsContent value={brand} className="sa-brand-content">
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as "overview" | "origins")}
            activationMode="manual"
          >
            <div className="sa-toolbar">
              <TabsList className="sa-tab-list" aria-label="Relatório de audiência">
                <TabsTrigger value="overview" className="sa-tab">
                  <Radio aria-hidden="true" /> Visão geral
                </TabsTrigger>
                <TabsTrigger value="origins" className="sa-tab">
                  <Waypoints aria-hidden="true" /> Origens
                </TabsTrigger>
              </TabsList>
              <div className="sa-date-controls">
                <div className="sa-segment" role="group" aria-label="Tipo de período">
                  {periodChoices.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={value === period}
                      onClick={() => {
                        setPeriod(value);
                        setOffset(0);
                      }}
                    >
                      <Icon aria-hidden="true" /> {label}
                    </button>
                  ))}
                </div>
                <div className="sa-range" aria-label="Navegação entre períodos">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Período anterior"
                    disabled={offset >= MAX_AUDIENCE_OFFSET}
                    onClick={() => setOffset(offset + 1)}
                  >
                    <ChevronLeft aria-hidden="true" />
                  </Button>
                  <span aria-live="polite">
                    {metadata
                      ? formatAudienceRange(metadata.from, metadata.to, period)
                      : `${selectedPeriod.label}${offset ? " anterior" : " atual"}`}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Período seguinte"
                    disabled={offset === 0}
                    onClick={() => setOffset(offset - 1)}
                  >
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>
            <TabsContent value="overview" className="sa-tab-content">
              <ReportMessage resource={overviewResource} overview />
              {overview && report?.status === "ready" && (
                <>
                  <div className="sa-overview-grid">
                    <div className="sa-traffic-stack">
                      <div className="sa-kpis" aria-label="Visão geral do período">
                        {metrics.map(({ key, label, icon: Icon }) => (
                          <article key={key} className="sa-card sa-kpi">
                            <h3>
                              <Icon aria-hidden="true" />
                              {label}
                            </h3>
                            <strong>{n(overview.totals[key])}</strong>
                            {key === "views" && overview.totals.sessions > 0 && (
                              <span className="sa-comparison">
                                {percentage.format(
                                  overview.totals.views / overview.totals.sessions,
                                )}{" "}
                                por sessão
                              </span>
                            )}
                            <Comparison
                              current={overview.totals[key]}
                              previous={overview.previous?.[key]}
                            />
                          </article>
                        ))}
                      </div>
                      <AudienceTraffic trend={overview.trend} period={period} />
                    </div>
                    <div className="sa-traffic-stack">
                      <article className="sa-card sa-card-padded">
                        <div className="sa-card-heading">
                          <h3>Interesse nos imóveis</h3>
                        </div>
                        <dl className="sa-interest">
                          <div>
                            <dt>Cliques em imóveis</dt>
                            <dd>{n(overview.totals.propertyClicks)}</dd>
                          </div>
                          <div>
                            <dt>Fichas abertas</dt>
                            <dd>{n(overview.totals.propertyViews)}</dd>
                          </div>
                        </dl>
                      </article>
                      {ranked[0] && <FeaturedProperty property={ranked[0]} order={order} />}
                    </div>
                  </div>
                  <div className="sa-rank-grid">
                    <PropertyRanking
                      rows={ranked}
                      period={period}
                      order={order}
                      onOrderChange={setOrder}
                    />
                    <div className="sa-card sa-card-padded">
                      <div className="sa-card-heading">
                        <div>
                          <h3>Páginas e menus</h3>
                          <p>
                            Cliques em menus <strong>{n(overview.totals.menuClicks)}</strong>
                          </p>
                        </div>
                        <PagesDialog
                          key={`${brand}-${period}-${offset}`}
                          scope={scope}
                          input={input}
                          loadReport={loadReport}
                        />
                      </div>
                      <AudienceRankings pages={overview.pages} menus={overview.menus} />
                    </div>
                  </div>
                  <NavigationBehavior data={overview.behavior} />
                </>
              )}
            </TabsContent>
            <TabsContent value="origins" className="sa-tab-content">
              <ReportMessage resource={originsResource} />
              {originsResource.report?.status === "ready" &&
                originsResource.report.view === "origins" && (
                  <AudienceOrigins report={originsResource.report} />
                )}
            </TabsContent>
          </Tabs>
          <div className="sa-footer">
            <span>
              {metadata?.environment === "qa" && "Ambiente de QA · "}
              {metadata?.status === "ready" && !metadata.collectionEnabled && "Coleta pausada · "}
              {metadata && `Atualizado ${formatAudienceDate(metadata.asOf, true)}`}
            </span>
            <MetricDefinitions metadata={metadata} />
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

const percentage = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
function Comparison({ current, previous }: { current: number; previous?: number }) {
  if (previous == null || previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 0.05)
    return <span className="sa-comparison">Estável ante o período anterior</span>;
  const Icon = change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="sa-comparison" data-direction={change > 0 ? "up" : "down"}>
      <Icon aria-hidden="true" />{" "}
      <strong>
        {change > 0 ? "+" : "−"}
        {percentage.format(Math.abs(change))}%
      </strong>{" "}
      <span>ante período anterior</span>
    </span>
  );
}

function ReportMessage({
  resource,
  compact = false,
  overview = false,
}: {
  resource: ReportResource;
  compact?: boolean;
  overview?: boolean;
}) {
  const { report, failed } = resource;
  if (report?.status === "ready")
    return failed ? (
      <p className="sa-empty-note" role="status">
        A atualização falhou. O relatório mantém a última leitura concluída.
      </p>
    ) : null;
  if (failed)
    return (
      <div className="sa-state" data-compact={compact} role="alert">
        <CircleAlert aria-hidden="true" />
        <h3>Relatório indisponível</h3>
        <p>Não foi possível consultar a audiência agora.</p>
        <Button variant="outline" size="sm" onClick={resource.refresh}>
          Tentar novamente
        </Button>
      </div>
    );
  if (!report)
    return (
      <div
        className="sa-loading"
        data-compact={compact}
        role="status"
        aria-label="Carregando a audiência do período"
      >
        <Skeleton className="sa-loading-chart" />
        <Skeleton className="sa-loading-property" />
        {overview && (
          <div className="sa-loading-details" aria-hidden="true">
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </div>
        )}
      </div>
    );
  const state = (
    {
      unauthorized: [
        ShieldOff,
        "Acesso restrito",
        "Seu perfil não tem acesso aos relatórios de audiência.",
      ],
      disabled: [
        ShieldOff,
        "Coleta desligada",
        "A medição de audiência desta marca ainda não está habilitada neste ambiente.",
      ],
      unavailable: [
        CircleAlert,
        "Período sem cobertura",
        "A coleta não cobre o intervalo selecionado.",
      ],
    } as const
  )[report.status];
  const [Icon, title, message] = state;
  return (
    <div className="sa-state" data-compact={compact} role="status">
      <Icon aria-hidden="true" />
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}

function PagesDialog({
  scope,
  input,
  loadReport,
}: {
  scope: string;
  input: Omit<AudienceReportInput, "view">;
  loadReport: ReportLoader;
}) {
  const [open, setOpen] = useState(false);
  const resource = useAudienceReport(scope, { ...input, view: "pages" }, loadReport, open);
  const report = resource.report;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="sa-action">
          <ListFilter aria-hidden="true" /> Detalhar
        </button>
      </DialogTrigger>
      <DialogContent
        className="sa-dialog"
        style={
          {
            "--sa-dialog-accent": input.brand === "cordial" ? "#287885" : "#966926",
          } as CSSProperties
        }
      >
        <DialogHeader>
          <DialogTitle>Páginas e menus · {getSiteBrand(input.brand).name}</DialogTitle>
          <DialogDescription>
            Visualizações de páginas e cliques no menu são medidos separadamente.
          </DialogDescription>
        </DialogHeader>
        <ReportMessage resource={resource} compact />
        {report?.status === "ready" && report.view === "pages" && (
          <>
            {report.actions && report.actions.length > 0 && (
              <div className="sa-rank-list">
                <h4>Ações no site</h4>
                <ol aria-label="Ações no site por frequência">
                  {report.actions.map((row) => (
                    <li key={row.key}>
                      <div>
                        <span>{actionLabels[row.key] ?? row.key}</span>
                        <strong>{n(row.count)}</strong>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <AudienceRankings pages={report.pages} menus={report.menus} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MetricDefinitions({
  metadata,
}: {
  metadata?: Exclude<AudienceReport, { status: "unauthorized" }>;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="sa-action">
          <MousePointer2 aria-hidden="true" /> Como medimos
        </button>
      </DialogTrigger>
      <DialogContent className="sa-dialog">
        <DialogHeader>
          <DialogTitle>Como medimos a audiência</DialogTitle>
          <DialogDescription>
            Os indicadores representam a navegação medida de cada marca, em conjunto.
          </DialogDescription>
        </DialogHeader>
        <dl className="sa-metric-definitions">
          {metadata && (
            <div>
              <dt>Cobertura da coleta</dt>
              <dd>
                {metadata.collectionEnabled ? "Coleta habilitada." : "Coleta desligada."}{" "}
                {metadata.partial && "Cobertura parcial no período. "}
                {metadata.collectionSince &&
                  `Disponível desde ${formatAudienceDate(metadata.collectionSince)}. `}
                {metadata.lastEventAt &&
                  `Último evento em ${formatAudienceDate(metadata.lastEventAt, true)}. `}
                Horário de São Paulo.
              </dd>
            </div>
          )}
          <div>
            <dt>Visitantes medidos</dt>
            <dd>
              Navegadores medidos deduplicados no período por identificador próprio da marca. É uma
              aproximação, pois uma pessoa pode usar mais de um navegador.
            </dd>
          </div>
          <div>
            <dt>Sessões</dt>
            <dd>
              Voltar pelo mesmo navegador em menos de 30 minutos mantém a sessão. Cada página
              exibida soma uma visualização. Após 30 minutos sem atividade, começa outra sessão.
            </dd>
          </div>
          <div>
            <dt>Visualizações</dt>
            <dd>
              Páginas efetivamente exibidas, incluindo a entrada direta. Fichas abertas, cliques no
              card e prévias rápidas são medidas próprias.
            </dd>
          </div>
          <div>
            <dt>Saídas rápidas</dt>
            <dd>
              Sessões encerradas com uma página, menos de 10 segundos ativos e sem interação
              relevante, entre as sessões com evidência de tempo ativo.
            </dd>
          </div>
          <div>
            <dt>Tempo ativo</dt>
            <dd>
              Tempo com conteúdo visível e sem ociosidade. A mediana usa somente sessões com
              evidência suficiente.
            </dd>
          </div>
          <div>
            <dt>Contato</dt>
            <dd>
              Cliques no WhatsApp medem abertura do canal. Formulários recebidos têm persistência
              confirmada.
            </dd>
          </div>
          <div>
            <dt>Amostra mínima</dt>
            <dd>
              Cada imóvel entra no ranking no primeiro clique ou na primeira visualização da ficha.
              Detalhes de comportamento, páginas, menus e origens exigem cinco sessões em produção.
            </dd>
          </div>
          <div>
            <dt>Comparação</dt>
            <dd>
              Períodos em andamento são comparados até o mesmo tempo decorrido no período anterior.
              Recortes sem volume suficiente ficam indisponíveis.
            </dd>
          </div>
        </dl>
      </DialogContent>
    </Dialog>
  );
}
