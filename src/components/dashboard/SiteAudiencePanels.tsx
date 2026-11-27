import {
  ArrowUpRight,
  Building2,
  Footprints,
  MousePointer2,
  ScanEye,
  Waypoints,
} from "lucide-react";
import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  AudienceBehavior,
  AudienceChannel,
  AudienceOrigin,
  AudienceOverview,
  AudiencePeriod,
  AudiencePropertyOrder,
  AudiencePropertyRank,
  AudienceRankItem,
  AudienceRatio,
} from "@/lib/site-audience/report";
import { formatAudienceBucket, n, routeLabel } from "./site-audience-format";

const rankLimit: Record<AudiencePeriod, number> = { day: 5, week: 5, month: 10 };
const groupBy: Record<AudiencePeriod, string> = {
  day: "Por hora",
  week: "Por dia",
  month: "Por dia",
};
const periodName: Record<AudiencePeriod, string> = {
  day: "do dia",
  week: "da semana",
  month: "do mês",
};
const orderName: Record<AudiencePropertyOrder, string> = {
  views: "Visualizações da ficha",
  clicks: "Cliques no card",
};

export function AudienceTraffic({
  trend,
  period,
}: {
  trend: AudienceOverview["trend"];
  period: AudiencePeriod;
}) {
  const gradientId = `audience-area-${useId().replaceAll(":", "")}`;
  const tickInterval = Math.max(0, Math.ceil(trend.length / (period === "week" ? 7 : 6)) - 1);
  const data = trend.map(({ start, views }) => ({
    label: formatAudienceBucket(start, period),
    views,
  }));

  return (
    <article className="sa-card sa-card-padded sa-traffic">
      <div className="sa-card-heading">
        <div>
          <h3>Tendência de tráfego</h3>
          <p>Visualizações de páginas</p>
        </div>
        <span className="sa-chart-unit">{groupBy[period]}</span>
      </div>
      {data.length > 0 ? (
        <>
          <div className="sa-chart">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart
                accessibilityLayer
                title="Visualizações de páginas por período"
                data={data}
                margin={{ top: 14, right: 18, left: -12, bottom: 0 }}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="currentColor" stopOpacity={0.015} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
                <XAxis
                  dataKey="label"
                  interval={tickInterval}
                  padding={{ left: 3, right: 6 }}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={9}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  width={43}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                />
                <Tooltip
                  trigger="click"
                  formatter={(value) => [n(Number(value)), "Visualizações"]}
                  cursor={{ stroke: "currentColor", strokeOpacity: 0.45 }}
                  wrapperStyle={{ outline: "none" }}
                  contentStyle={{
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Area
                  dataKey="views"
                  name="Visualizações"
                  type="monotone"
                  stroke="currentColor"
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  isAnimationActive={false}
                  dot={data.length === 1}
                  activeDot={{ r: 4, fill: "currentColor", stroke: "var(--card)" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <details className="sa-chart-data">
            <summary>Dados do gráfico</summary>
            <table>
              <caption className="sr-only">Visualizações de páginas por período</caption>
              <thead>
                <tr>
                  <th scope="col">{period === "day" ? "Hora" : "Data"}</th>
                  <th scope="col">Visualizações</th>
                </tr>
              </thead>
              <tbody>
                {data.map((point, i) => (
                  <tr key={trend[i].start}>
                    <th scope="row">{point.label}</th>
                    <td>{point.views === null ? "Sem cobertura" : n(point.views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : (
        <p className="sa-card-empty">Sem série de visualizações para exibir.</p>
      )}
    </article>
  );
}

export function FeaturedProperty({
  property,
  order,
}: {
  property?: AudiencePropertyRank;
  order: AudiencePropertyOrder;
}) {
  const listing = property?.listing;
  return (
    <article className="sa-card sa-featured">
      <div className="sa-featured-photo" data-empty={!listing?.coverUrl}>
        {listing?.coverUrl ? (
          <img
            src={listing.coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : (
          <Building2 aria-hidden="true" />
        )}
        {property && <span>Nº 1 em {order === "views" ? "visualizações" : "cliques"}</span>}
      </div>
      <div className="sa-featured-body">
        {property ? (
          <>
            <div className="sa-featured-title">
              <h3>{listing?.name ?? "Imóvel fora do ar"}</h3>
              {listing?.url && (
                <a
                  href={listing.url}
                  className="sa-action"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Abrir ficha de ${listing.name} em nova aba`}
                >
                  <ArrowUpRight aria-hidden="true" />
                </a>
              )}
            </div>
            {listing?.code && <p>Código {listing.code}</p>}
            <dl className="sa-featured-stats">
              <div>
                <dt>Visualizações</dt>
                <dd>{n(property.views)}</dd>
              </div>
              <div>
                <dt>Sessões</dt>
                <dd>{n(property.sessions)}</dd>
              </div>
              <div>
                <dt>Cliques no card</dt>
                <dd>{n(property.clicks)}</dd>
              </div>
            </dl>
          </>
        ) : (
          <>
            <h3>{order === "views" ? "Imóvel mais visto" : "Imóvel mais clicado"}</h3>
            <p>
              {order === "views"
                ? "Nenhuma ficha no ranking do período."
                : "Nenhum imóvel no ranking de cliques."}
            </p>
          </>
        )}
      </div>
    </article>
  );
}

export function PropertyRanking({
  rows,
  total,
  period,
  order,
  onOrderChange,
}: {
  rows: AudiencePropertyRank[];
  total?: number;
  period: AudiencePeriod;
  order: AudiencePropertyOrder;
  onOrderChange: (order: AudiencePropertyOrder) => void;
}) {
  const items = rows.slice(0, rankLimit[period]);
  const max = Math.max(1, ...items.map((row) => row[order]));
  return (
    <article className="sa-card sa-card-padded">
      <div className="sa-card-heading">
        <div>
          <h3>
            Top {rankLimit[period]} {periodName[period]}
          </h3>
          <p>{orderName[order]}</p>
        </div>
        <div className="sa-segment sa-sort" role="group" aria-label="Ordenar imóveis por">
          <button
            type="button"
            aria-pressed={order === "views"}
            onClick={() => onOrderChange("views")}
          >
            <ScanEye aria-hidden="true" /> Fichas
          </button>
          <button
            type="button"
            aria-pressed={order === "clicks"}
            onClick={() => onOrderChange("clicks")}
          >
            <MousePointer2 aria-hidden="true" /> Cliques
          </button>
        </div>
      </div>
      {items.length ? (
        <ol className="sa-properties" aria-label={`Imóveis por ${orderName[order].toLowerCase()}`}>
          {items.map((row, i) => (
            <li key={row.publicId}>
              <span className="sa-rank-position" aria-hidden="true">
                {i + 1}
              </span>
              <details>
                <summary>
                  <span className="sa-property-name">
                    <strong>{row.listing?.name ?? "Imóvel fora do ar"}</strong>
                    {row.listing?.code && <small>{row.listing.code}</small>}
                  </span>
                  <strong className="sa-rank-count">{n(row[order])}</strong>
                </summary>
                <Bar width={row[order] / max} />
                <dl className="sa-property-stats">
                  <div>
                    <dt>Visualizações da ficha</dt>
                    <dd>{n(row.views)}</dd>
                  </div>
                  <div>
                    <dt>Cliques no card</dt>
                    <dd>{n(row.clicks)}</dd>
                  </div>
                  <div>
                    <dt>Sessões que viram a ficha</dt>
                    <dd>{n(row.sessions)}</dd>
                  </div>
                  <div>
                    <dt>Reaberturas na sessão</dt>
                    <dd>{n(row.reopens)}</dd>
                  </div>
                  <div>
                    <dt>Sessões de retorno</dt>
                    <dd>{n(row.returnSessions)}</dd>
                  </div>
                  <div>
                    <dt>Prévias rápidas</dt>
                    <dd>{n(row.previews)}</dd>
                  </div>
                  <div>
                    <dt>Cliques no WhatsApp</dt>
                    <dd>{n(row.whatsapp)}</dd>
                  </div>
                  <div>
                    <dt>Formulários recebidos</dt>
                    <dd>{n(row.forms)}</dd>
                  </div>
                </dl>
              </details>
            </li>
          ))}
        </ol>
      ) : (
        <p className="sa-card-empty">
          {total
            ? "O ranking aparece a partir de cinco sessões por imóvel."
            : order === "views"
              ? "Nenhuma ficha aberta no período."
              : "Nenhum clique em imóvel no período."}
        </p>
      )}
    </article>
  );
}

function Bar({ width }: { width: number }) {
  return (
    <div className="sa-bar" aria-hidden="true">
      <span style={{ width: `${Math.max(0, Math.min(1, width)) * 100}%` }} />
    </div>
  );
}

export function AudienceRankings({
  pages,
  menus,
}: {
  pages: AudienceRankItem[];
  menus: AudienceRankItem[];
}) {
  return (
    <div className="sa-pages-grid">
      <RankList label="Páginas mais vistas" metric="Visualizações" data={pages} />
      <RankList label="Menus mais clicados" metric="Cliques" data={menus} />
    </div>
  );
}

function RankList({
  label,
  metric,
  data,
}: {
  label: string;
  metric: string;
  data: AudienceRankItem[];
}) {
  const max = Math.max(1, ...data.map((item) => item.count));
  return (
    <div className="sa-rank-list">
      <h4>{label}</h4>
      {data.length ? (
        <ol aria-label={`${label} por ${metric.toLowerCase()}`}>
          {data.map((item) => (
            <li key={item.key}>
              <div>
                <span>{routeLabel(item.key)}</span>
                <strong>{n(item.count)}</strong>
              </div>
              <Bar width={item.count / max} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="sa-card-empty">Nenhum registro disponível no ranking.</p>
      )}
    </div>
  );
}

const ratioPercent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
function Ratio({
  value,
  sampleLabel = "sessões",
}: {
  value: AudienceRatio | null;
  sampleLabel?: string;
}) {
  if (!value || value.sample === 0) return <p className="sa-sample">Amostra indisponível</p>;
  return (
    <>
      <strong className="sa-behavior-value">
        {ratioPercent.format(value.count / value.sample)}
      </strong>
      <Bar width={value.count / value.sample} />
      <span className="sa-sample">
        {n(value.count)} de {n(value.sample)} {sampleLabel}
      </span>
    </>
  );
}

function formatDuration(value: number) {
  const seconds = Math.round(value);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

export function NavigationBehavior({ data }: { data: AudienceBehavior }) {
  return (
    <article className="sa-card sa-card-padded sa-navigation">
      <div className="sa-card-heading">
        <div>
          <h3>Termômetro de navegação</h3>
          <p>Comportamento agregado das sessões</p>
        </div>
        <Footprints className="sa-card-icon" aria-hidden="true" />
      </div>
      <div className="sa-behavior-grid">
        <div>
          <h4>Saídas rápidas</h4>
          <Ratio value={data.quickExits} sampleLabel="sessões encerradas com tempo medido" />
          <p>Uma página, menos de 10 s ativos e sem interação relevante.</p>
        </div>
        <div>
          <h4>Mediana de tempo ativo</h4>
          {data.activeTime ? (
            <>
              <strong className="sa-behavior-value">
                {formatDuration(data.activeTime.medianSeconds)}
              </strong>
              <span className="sa-sample">
                {n(data.activeTime.sample)} de {n(data.activeTime.total)} sessões com tempo medido
              </span>
            </>
          ) : (
            <p className="sa-sample">Tempo indisponível</p>
          )}
        </div>
        <div>
          <h4>Viram 2+ imóveis distintos</h4>
          <Ratio value={data.multipleProperties} />
        </div>
        <div>
          <h4>Reabriram na mesma sessão</h4>
          <Ratio value={data.sameSessionReopen} sampleLabel="sessões com ficha" />
        </div>
        <div>
          <h4>Retornaram em outra sessão</h4>
          <Ratio value={data.laterSessionReturn} sampleLabel="sessões com ficha" />
        </div>
      </div>
      <details className="sa-journeys">
        <summary>
          <Waypoints aria-hidden="true" /> Jornadas e contato
        </summary>
        <div className="sa-journey-grid">
          <div>
            <h4>Busca → Imóvel → Outro imóvel</h4>
            <Ratio value={data.searchToSecondProperty} sampleLabel="sessões com busca" />
          </div>
          <div>
            <h4>Imóvel → WhatsApp</h4>
            <Ratio value={data.propertyToWhatsapp} sampleLabel="sessões com ficha" />
          </div>
          <div>
            <h4>Sessões com formulário recebido</h4>
            <Ratio value={data.forms} sampleLabel="sessões" />
          </div>
        </div>
      </details>
    </article>
  );
}

const channelName: Record<AudienceChannel, string> = {
  organic: "Busca orgânica",
  paid: "Campanha paga",
  social: "Redes sociais",
  referral: "Referência",
  direct: "Direto/sem origem identificável",
  campaign: "Campanha identificada",
};

type OriginReport = { origins: AudienceOrigin[]; withheldSessions: number; totalSessions: number };

export function AudienceOrigins({ report }: { report: OriginReport }) {
  const { origins, withheldSessions, totalSessions } = report;
  const channelCounts = new Map<AudienceChannel, number>();
  for (const origin of origins)
    channelCounts.set(origin.channel, (channelCounts.get(origin.channel) ?? 0) + origin.sessions);
  const channels = [...channelCounts].sort(([a, an], [b, bn]) => bn - an || a.localeCompare(b));
  return (
    <article className="sa-card sa-card-padded sa-origins">
      <div className="sa-card-heading">
        <div>
          <h3>De onde vieram as sessões</h3>
          <p>Sessões agrupadas por origem e página de entrada</p>
        </div>
        <span className="sa-chart-unit">{n(totalSessions)} sessões</span>
      </div>
      {channels.length > 0 && (
        <ul className="sa-origin-channels" aria-label="Canais nas origens exibidas">
          {channels.map(([channel, sessions]) => (
            <li key={channel}>
              <div>
                <span>{channelName[channel]}</span>
                <strong>{n(sessions)}</strong>
              </div>
              <Bar width={sessions / Math.max(1, totalSessions)} />
            </li>
          ))}
        </ul>
      )}
      {origins.length ? (
        <div
          className="sa-origin-table"
          role="region"
          aria-label="Detalhamento das origens"
          tabIndex={0}
        >
          <table>
            <caption className="sr-only">
              Origem e avanço das sessões medidas por canal, campanha e página de entrada.
            </caption>
            <thead>
              <tr>
                <th scope="col">Canal</th>
                <th scope="col">Origem / mídia</th>
                <th scope="col">Campanha</th>
                <th scope="col">Entrada</th>
                <th scope="col">Sessões</th>
                <th scope="col">Viram imóvel</th>
                <th scope="col">Contato</th>
              </tr>
            </thead>
            <tbody>
              {origins.map((row) => (
                <tr
                  key={JSON.stringify([
                    row.channel,
                    row.source,
                    row.medium,
                    row.campaign,
                    row.entryPage,
                  ])}
                >
                  <th scope="row">{channelName[row.channel]}</th>
                  <td>{[row.source, row.medium].filter(Boolean).join(" / ") || "—"}</td>
                  <td>{row.campaign ?? "—"}</td>
                  <td>{routeLabel(row.entryPage)}</td>
                  <td>{n(row.sessions)}</td>
                  <td>{n(row.propertySessions)}</td>
                  <td>{n(row.contactSessions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="sa-card-empty">
          {totalSessions
            ? "Amostra insuficiente para detalhar as origens."
            : "Nenhuma sessão medida no período."}
        </p>
      )}
      {withheldSessions > 0 && (
        <p className="sa-sample">
          {n(withheldSessions)} sessões sem detalhamento por volume insuficiente ou limite do
          relatório.
        </p>
      )}
      {origins.length > 0 && (
        <p className="sa-sample">Contato indica clique no WhatsApp ou formulário recebido.</p>
      )}
    </article>
  );
}
