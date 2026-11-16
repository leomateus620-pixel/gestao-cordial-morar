import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, MessageCircle, ArrowUpRight } from "lucide-react";
import type { BotBrand } from "@/lib/public-property-bot/contracts";
import type {
  BotInsights,
  BrandInsights,
  BotConversationList,
  BotConversationDetail,
  InsightDays,
} from "@/lib/public-bot-insights/contracts";
import { summarizeConversation } from "@/lib/public-bot-insights/summaries";
import { Mascot } from "@/components/public-property-bot/Mascot";
import { PublicBotInsightsDrawer } from "./PublicBotInsightsDrawer";
import {
  botNames,
  number,
  dayLabel,
  dateTime,
  localDate,
  InsightsNotice,
  type InsightQuery,
} from "./PublicBotInsightsShared";
import "./PublicBotInsights.css";

export type PublicBotInsightsViewProps = {
  days: InsightDays;
  onDaysChange: (days: InsightDays) => void;
  brand: BotBrand | null;
  onBrandChange: (brand: BotBrand) => void;
  page: number;
  onPageChange: (page: number) => void;
  conversationId: string | null;
  onConversationChange: (id: string | null) => void;
  overview: InsightQuery<BotInsights>;
  conversations: InsightQuery<BotConversationList>;
  detail: InsightQuery<BotConversationDetail | null>;
};

export function PublicBotInsightsView(props: PublicBotInsightsViewProps) {
  const {
    days,
    onDaysChange,
    brand,
    onBrandChange,
    page,
    onPageChange,
    conversationId,
    onConversationChange,
    overview,
    conversations,
    detail,
  } = props;
  const uid = useId();
  const listHeading = useRef<HTMLHeadingElement>(null);
  const selectedRow = useRef<HTMLButtonElement | null>(null);
  const data = overview.data?.period.days === days ? overview.data : undefined;
  useEffect(() => {
    if (brand) listHeading.current?.focus({ preventScroll: true });
  }, [brand]);
  const partialHistory = data && localDate(data.trackingSince) >= data.period.from;
  const list = conversations.data;
  const totalPages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;

  return (
    <section className="public-bot-insights" aria-labelledby={`${uid}-title`}>
      <header className="pbi-heading">
        <div>
          <p className="pbi-eyebrow">Cordial e Morar</p>
          <h2 id={`${uid}-title`}>Busca nos sites</h2>
          <p className="pbi-subtitle">
            Acompanhe o interesse pelos imóveis e os caminhos até a equipe.
          </p>
        </div>
        <fieldset className="pbi-period">
          <legend className="pbi-sr-only">Período dos bots</legend>
          {([1, 7, 30] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name={`${uid}-period`}
                value={value}
                checked={days === value}
                onChange={() => onDaysChange(value)}
              />
              <span>{value === 1 ? "Hoje" : `${value} dias`}</span>
            </label>
          ))}
        </fieldset>
      </header>

      {overview.isError ? (
        <InsightsNotice error retry={overview.refetch}>
          Não foi possível carregar a atividade dos bots.
        </InsightsNotice>
      ) : (
        <div className="pbi-cards" aria-busy={overview.isLoading || !data}>
          {(["cordial", "morar"] as const).map((item) => (
            <BotInsightCard
              key={item}
              brand={item}
              data={data?.brands.find((entry) => entry.brand === item)}
              selected={brand === item}
              listId={`${uid}-sessions`}
              onSelect={() => onBrandChange(item)}
            />
          ))}
        </div>
      )}

      {data && !overview.isError && (
        <div className="pbi-context">
          <p>
            {dayLabel(data.period.from)}
            {data.period.from !== data.period.to && ` a ${dayLabel(data.period.to)}`} · Horário de
            Brasília
          </p>
          <p>
            Acessos são aberturas confirmadas. Sessões e conversas contabilizam os inícios no
            período.
          </p>
          <p>WhatsApp registra cliques; não confirma contato ou fechamento.</p>
          {partialHistory && (
            <p className="pbi-history-note">
              Histórico parcial: coleta iniciada em {dateTime(data.trackingSince)}.
            </p>
          )}
          {overview.isFetching && (
            <span className="pbi-refresh" role="status">
              Atualizando…
            </span>
          )}
        </div>
      )}

      {brand && (
        <section
          className="pbi-sessions"
          id={`${uid}-sessions`}
          aria-labelledby={`${uid}-sessions-title`}
        >
          <header className="pbi-sessions-heading">
            <div>
              <h3 ref={listHeading} tabIndex={-1} id={`${uid}-sessions-title`}>
                Sessões do {botNames[brand]}
              </h3>
              <p>Sessões com atividade no período.</p>
            </div>
            {list && !conversations.isError && (
              <span className="pbi-total">
                {number(list.total)} {list.total === 1 ? "sessão" : "sessões"}
              </span>
            )}
          </header>
          {conversations.isError ? (
            <InsightsNotice error retry={conversations.refetch}>
              Não foi possível carregar as sessões.
            </InsightsNotice>
          ) : conversations.isLoading || !list ? (
            <InsightsNotice>Carregando as sessões…</InsightsNotice>
          ) : !list.items.length ? (
            <InsightsNotice>Nenhuma sessão neste período.</InsightsNotice>
          ) : (
            <>
              <ul className="pbi-session-list" aria-busy={conversations.isFetching}>
                {list.items
                  .filter((item) => item.brand === brand)
                  .map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="pbi-session-row"
                        aria-haspopup="dialog"
                        onClick={(event) => {
                          selectedRow.current = event.currentTarget;
                          onConversationChange(item.id);
                        }}
                      >
                        <span className="pbi-row-main">
                          <time dateTime={item.startedAt}>{dateTime(item.startedAt)}</time>
                          <span className="pbi-row-summary">{summarizeConversation(item)}</span>
                        </span>
                        <span className="pbi-row-activity">
                          <span>
                            <MessageCircle size={15} aria-hidden="true" />
                            {number(item.messages)} {item.messages === 1 ? "envio" : "envios"}
                          </span>
                          <span>
                            <ArrowUpRight size={15} aria-hidden="true" />
                            {number(item.whatsapp)} {item.whatsapp === 1 ? "clique" : "cliques"} no
                            WhatsApp
                          </span>
                        </span>
                        <ChevronRight className="pbi-row-arrow" size={18} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
              </ul>
              <nav
                className="pbi-pagination"
                aria-label={`Páginas de sessões do ${botNames[brand]}`}
              >
                <button
                  className="pbi-button"
                  type="button"
                  disabled={page <= 1 || conversations.isFetching}
                  onClick={() => onPageChange(page - 1)}
                >
                  <ChevronLeft size={16} aria-hidden="true" /> Anterior
                </button>
                <span aria-live="polite">
                  Página {number(page)} de {number(totalPages)}
                </span>
                <button
                  className="pbi-button"
                  type="button"
                  disabled={page >= totalPages || conversations.isFetching}
                  onClick={() => onPageChange(page + 1)}
                >
                  Próxima <ChevronRight size={16} aria-hidden="true" />
                </button>
              </nav>
            </>
          )}
        </section>
      )}

      <PublicBotInsightsDrawer
        brand={brand}
        id={conversationId}
        query={detail}
        onClose={() => onConversationChange(null)}
        restoreFocus={() => selectedRow.current?.isConnected && selectedRow.current.focus()}
      />
    </section>
  );
}

function BotInsightCard({
  brand,
  data,
  selected,
  listId,
  onSelect,
}: {
  brand: BotBrand;
  data?: BrandInsights;
  selected: boolean;
  listId: string;
  onSelect: () => void;
}) {
  const uid = useId();
  return (
    <article className="pbi-card" data-brand={brand} aria-labelledby={`${uid}-name`}>
      <header className="pbi-card-heading">
        <span className="pbi-avatar">
          <Mascot brand={brand} size={44} />
        </span>
        <div>
          <h3 id={`${uid}-name`}>{botNames[brand]}</h3>
          <p>{brand === "cordial" ? "Site Cordial" : "Site Morar"}</p>
        </div>
      </header>
      {data ? (
        <>
          <dl className="pbi-metrics">
            {(
              [
                ["Acessos", data.opens],
                ["Cliques no WhatsApp", data.whatsapp],
                ["Novas sessões", data.sessions],
                ["Conversas iniciadas", data.conversations],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{number(value)}</dd>
              </div>
            ))}
          </dl>
          <DailyEvolution data={data} />
          {!data.opens && !data.sessions && !data.conversations && !data.whatsapp && (
            <p className="pbi-card-empty">Sem atividade registrada neste período.</p>
          )}
        </>
      ) : (
        <div className="pbi-card-loading" role="status">
          <span>Carregando atividade…</span>
          <div aria-hidden="true" />
          <div aria-hidden="true" />
        </div>
      )}
      <button
        type="button"
        className="pbi-card-action"
        onClick={onSelect}
        disabled={!data}
        aria-expanded={selected}
        aria-controls={listId}
      >
        Ver sessões <ArrowRight size={17} aria-hidden="true" />
      </button>
    </article>
  );
}

const chartSeries = {
  opens: { label: "Acessos", daily: "Acessos por dia", singular: "acesso", plural: "acessos" },
  conversations: {
    label: "Conversas iniciadas",
    daily: "Conversas iniciadas por dia",
    singular: "conversa",
    plural: "conversas",
  },
  whatsapp: {
    label: "WhatsApp",
    daily: "Cliques no WhatsApp por dia",
    singular: "clique",
    plural: "cliques",
  },
};

function DailyEvolution({ data }: { data: BrandInsights }) {
  const uid = useId();
  const [series, setSeries] = useState<keyof typeof chartSeries>("conversations");
  const metric = chartSeries[series];
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const focused = useRef(false);
  const active = activeDay === null ? undefined : data.daily[activeDay];
  const max = Math.max(1, ...data.daily.map((item) => item[series]));
  const width = 420;
  const step = width / Math.max(1, data.daily.length);
  return (
    <div className="pbi-chart">
      <div className="pbi-chart-heading">
        <select
          className="pbi-chart-select"
          aria-label={`Métrica diária do ${botNames[data.brand]}`}
          value={series}
          onChange={(event) => setSeries(event.target.value as keyof typeof chartSeries)}
        >
          {Object.entries(chartSeries).map(([key, item]) => (
            <option key={key} value={key}>
              {item.label}
            </option>
          ))}
        </select>
        <span>
          {number(data.messages)} {data.messages === 1 ? "envio" : "envios"} ao bot
        </span>
      </div>
      {data.daily.length ? (
        <>
          <div
            className="pbi-chart-interactive"
            role="group"
            tabIndex={0}
            aria-label={`Evolução diária do ${botNames[data.brand]}`}
            aria-describedby={`${uid}-help ${uid}-value`}
            onFocus={() => {
              focused.current = true;
              setActiveDay(data.daily.length - 1);
            }}
            onBlur={() => {
              focused.current = false;
              setActiveDay(null);
            }}
            onPointerMove={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              if (bounds.width > 0)
                setActiveDay(
                  Math.max(
                    0,
                    Math.min(
                      data.daily.length - 1,
                      Math.floor(
                        ((event.clientX - bounds.left) / bounds.width) * data.daily.length,
                      ),
                    ),
                  ),
                );
            }}
            onClick={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              if (bounds.width > 0)
                setActiveDay(
                  Math.max(
                    0,
                    Math.min(
                      data.daily.length - 1,
                      Math.floor(
                        ((event.clientX - bounds.left) / bounds.width) * data.daily.length,
                      ),
                    ),
                  ),
                );
            }}
            onPointerLeave={() => {
              if (!focused.current) setActiveDay(null);
            }}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const index = activeDay ?? data.daily.length - 1;
              setActiveDay(
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? data.daily.length - 1
                    : Math.max(
                        0,
                        Math.min(
                          data.daily.length - 1,
                          index + (event.key === "ArrowLeft" ? -1 : 1),
                        ),
                      ),
              );
            }}
          >
            <span id={`${uid}-help`} className="pbi-sr-only">
              Use as setas esquerda e direita para consultar cada dia.
            </span>
            <svg
              viewBox={`0 0 ${width} 54`}
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="0" x2={width} y1="53" y2="53" />
              {data.daily.map((item, index) => {
                const barWidth = Math.min(36, Math.max(2, step - 6));
                const height = (item[series] / max) * 46;
                return (
                  <rect
                    key={item.date}
                    data-active={activeDay === index}
                    x={index * step + (step - barWidth) / 2}
                    y={53 - height}
                    width={barWidth}
                    height={height}
                    rx="3"
                  />
                );
              })}
            </svg>
          </div>
          <div className="pbi-chart-dates">
            <span aria-hidden="true">{dayLabel(data.daily[0].date)}</span>
            <span id={`${uid}-value`} className="pbi-chart-value" role="status" aria-live="polite">
              {active
                ? `${dayLabel(active.date)} · ${number(active[series])} ${active[series] === 1 ? metric.singular : metric.plural}`
                : ""}
            </span>
            {data.daily.length > 1 && (
              <span aria-hidden="true">{dayLabel(data.daily[data.daily.length - 1].date)}</span>
            )}
          </div>
          <table className="pbi-sr-only">
            <caption>
              {metric.daily} do {botNames[data.brand]}
            </caption>
            <thead>
              <tr>
                <th>Data</th>
                <th>{metric.label}</th>
              </tr>
            </thead>
            <tbody>
              {data.daily.map((item) => (
                <tr key={item.date}>
                  <th scope="row">{dayLabel(item.date)}</th>
                  <td>{number(item[series])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="pbi-footnote">Ainda não há evolução diária registrada.</p>
      )}
    </div>
  );
}
