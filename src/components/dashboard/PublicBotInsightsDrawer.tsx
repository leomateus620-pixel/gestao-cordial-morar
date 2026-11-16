import { useEffect, useId, useState } from "react";
import { MessageCircle, ArrowUpRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { BotBrand } from "@/lib/public-property-bot/contracts";
import type { BotConversationDetail } from "@/lib/public-bot-insights/contracts";
import { describeSearch, evolutionLabel } from "@/lib/public-bot-insights/summaries";
import {
  botNames,
  dateTime,
  number,
  InsightsNotice,
  type InsightQuery,
} from "./PublicBotInsightsShared";

const sources = {
  header: "no topo do chat",
  card: "em um imóvel",
  quota: "após o limite diário",
  unavailable: "com o serviço indisponível",
};

export function PublicBotInsightsDrawer({
  brand,
  id,
  query,
  onClose,
  restoreFocus,
}: {
  brand: BotBrand | null;
  id: string | null;
  query: InsightQuery<BotConversationDetail | null>;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const uid = useId();
  const [eventKind, setEventKind] = useState<"all" | "turn" | "whatsapp">("all");
  useEffect(() => setEventKind("all"), [id]);
  // A result from another selection must never appear while the next request resolves.
  const detail = query.data?.id === id && query.data.brand === brand ? query.data : undefined;
  const visibleEvents =
    detail?.evolution.filter((event) => eventKind === "all" || event.kind === eventKind) ?? [];
  return (
    <Sheet open={brand !== null && id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="public-bot-insights-drawer"
        overlayClassName="public-bot-insights-overlay"
        closeLabel="Fechar detalhes da sessão"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        <SheetHeader className="pbi-drawer-header">
          <p className="pbi-eyebrow">{brand ? botNames[brand] : "Busca nos sites"}</p>
          <SheetTitle>Detalhes da sessão</SheetTitle>
          <SheetDescription>
            Preferências e evolução da busca. Horários de Brasília.
          </SheetDescription>
        </SheetHeader>
        <div className="pbi-drawer-body">
          {!id ? null : query.isError ? (
            <InsightsNotice error retry={query.refetch}>
              Não foi possível carregar esta sessão.
            </InsightsNotice>
          ) : query.data === null && !query.isLoading ? (
            <InsightsNotice>
              Esta sessão não está mais disponível. O histórico detalhado é mantido por tempo
              limitado.
            </InsightsNotice>
          ) : !detail || query.isLoading ? (
            <InsightsNotice>Carregando a sessão…</InsightsNotice>
          ) : (
            <>
              <dl className="pbi-session-meta">
                <div>
                  <dt>Início</dt>
                  <dd>{dateTime(detail.startedAt)}</dd>
                </div>
                <div>
                  <dt>Última atividade</dt>
                  <dd>{dateTime(detail.lastActivityAt)}</dd>
                </div>
                <div>
                  <dt>Envios ao bot</dt>
                  <dd>{number(detail.messages)}</dd>
                </div>
                <div>
                  <dt>Cliques no WhatsApp</dt>
                  <dd>{number(detail.whatsapp)}</dd>
                </div>
              </dl>
              <section className="pbi-profile" aria-label="Perfil da procura">
                <h3>Perfil da procura</h3>
                <dl>
                  <div>
                    <dt>Preferências iniciais</dt>
                    <dd>{describeSearch(detail.initialFilters)}</dd>
                  </div>
                  <div>
                    <dt>Preferências mais recentes</dt>
                    <dd>{describeSearch(detail.latestFilters)}</dd>
                  </div>
                </dl>
              </section>
              <section className="pbi-evolution" aria-label="Evolução da sessão">
                <h3>Evolução da sessão</h3>
                {detail.evolution.length > 0 && (
                  <fieldset className="pbi-event-filter">
                    <legend className="pbi-sr-only">Eventos da sessão</legend>
                    {(
                      [
                        ["all", "Todos"],
                        ["turn", "Envios"],
                        ["whatsapp", "WhatsApp"],
                      ] as const
                    ).map(([value, label]) => (
                      <label key={value}>
                        <input
                          type="radio"
                          name={`${uid}-events`}
                          value={value}
                          checked={eventKind === value}
                          onChange={() => setEventKind(value)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </fieldset>
                )}
                {detail.evolutionTruncated && (
                  <p className="pbi-history-note" role="status">
                    Histórico parcial: exibindo os {number(detail.evolution.length)} eventos mais
                    recentes de {number(detail.evolutionTotal)} registrados.
                  </p>
                )}
                {!detail.evolution.length ? (
                  <InsightsNotice>
                    O bot foi aberto, mas ainda não há perguntas ou cliques registrados.
                  </InsightsNotice>
                ) : !visibleEvents.length ? (
                  <InsightsNotice>Nenhum evento deste tipo no histórico exibido.</InsightsNotice>
                ) : (
                  <ol className="pbi-timeline">
                    {visibleEvents.map((event, index) => (
                      <li key={`${event.at}-${event.kind}-${index}`}>
                        <span className="pbi-timeline-icon" aria-hidden="true">
                          {event.kind === "whatsapp" ? (
                            <ArrowUpRight size={16} />
                          ) : (
                            <MessageCircle size={16} />
                          )}
                        </span>
                        <div className="pbi-timeline-content">
                          <time dateTime={event.at}>{dateTime(event.at)}</time>
                          <h4>{evolutionLabel(event)}</h4>
                          {event.question && <p className="pbi-question">{event.question}</p>}
                          {event.answer && (
                            <p className="pbi-answer">
                              <span>Bot: </span>
                              {event.answer}
                            </p>
                          )}
                          {event.filters && (
                            <p className="pbi-event-filters">{describeSearch(event.filters)}</p>
                          )}
                          {event.kind === "whatsapp" && (
                            <p className="pbi-event-filters">
                              Clique registrado{event.source ? ` ${sources[event.source]}` : ""}. O
                              contato com a equipe não é confirmado pelo site.
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
              <p className="pbi-footnote">
                Dados de contato detectados nas perguntas são mascarados antes do registro.
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
