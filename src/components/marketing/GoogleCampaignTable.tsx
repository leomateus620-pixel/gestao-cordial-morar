import { useEffect, useState, type RefObject } from "react";
import { Columns3, Pause, CirclePlay, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type {
  GoogleMarketingOverview,
  GoogleMarketingSort,
} from "@/lib/marketing/google-overview.types";
import { GoogleSelect } from "./GoogleAdsPrimitives";
import { googleMetricLabel } from "./google-metrics";
import {
  campaignColumns,
  compactColumns,
  defaultColumns,
  googleColumnsFromPreference,
  toggleGoogleColumn,
  type CampaignColumn,
} from "./google-campaign-columns";
import "./google-campaigns.css";

const sortOptions: Array<{ value: GoogleMarketingSort; label: string }> = [
  { value: "name_asc", label: "Nome A–Z" },
  { value: "name_desc", label: "Nome Z–A" },
  { value: "status_asc", label: "Status registrado" },
  { value: "updated_desc", label: "Mais recentes" },
];
export function GoogleCampaignTable({
  data,
  onSelect,
  onPage,
  onSort,
  canViewFinancialInsights = false,
  preferenceKey,
  campaignButtons,
}: {
  data: GoogleMarketingOverview;
  onSelect: (id: string) => void;
  onPage: (page: number) => void;
  onSort: (sort: GoogleMarketingSort) => void;
  canViewFinancialInsights?: boolean;
  preferenceKey?: string;
  campaignButtons: RefObject<Map<string, HTMLButtonElement>>;
}) {
  const [compact, setCompact] = useState(false);
  const [columnState, setColumnState] = useState<{
    key?: string;
    columns: CampaignColumn[] | null;
  }>({ key: preferenceKey, columns: null });
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!preferenceKey) {
      setColumnState({ key: preferenceKey, columns: null });
      return;
    }
    try {
      const raw = localStorage.getItem(preferenceKey);
      setColumnState({
        key: preferenceKey,
        columns: raw ? googleColumnsFromPreference(JSON.parse(raw)) : null,
      });
    } catch {
      setColumnState({ key: preferenceKey, columns: null });
    }
  }, [preferenceKey]);
  const currentColumns = columnState.key === preferenceKey ? columnState.columns : null;
  const visibleColumns = currentColumns ?? (compact ? compactColumns : defaultColumns);
  const columns = campaignColumns.filter((column) => visibleColumns.includes(column.key));
  function updateColumns(next: CampaignColumn[] | null) {
    setColumnState({ key: preferenceKey, columns: next });
    if (preferenceKey) {
      try {
        if (next) localStorage.setItem(preferenceKey, JSON.stringify(next));
        else localStorage.removeItem(preferenceKey);
      } catch {
        /* The current selection still works when storage is unavailable. */
      }
    }
  }
  const metricSorts: Array<{ value: GoogleMarketingSort; label: string }> = [
    { value: "clicks_desc", label: "Mais cliques" },
    { value: "impressions_desc", label: "Mais impressões" },
    { value: "conversions_desc", label: "Mais conversões" },
    { value: "ctr_desc", label: "Maior CTR" },
    ...(canViewFinancialInsights
      ? [
          { value: "cost_desc" as const, label: "Maior custo" },
          { value: "cpc_desc" as const, label: "Maior CPC" },
          { value: "cost_per_conversion_desc" as const, label: "Maior custo/conversão" },
        ]
      : []),
  ];
  return (
    <section className="gads-surface gads-campaigns" aria-labelledby="google-campaigns-title">
      <header className="gads-campaign-header">
        <div className="gads-campaign-heading">
          <h2 id="google-campaigns-title">Campanhas</h2>
          <span
            className="gads-campaign-count"
            aria-label={`${data.total} campanhas no escopo selecionado`}
          >
            {data.total.toLocaleString("pt-BR")}
          </span>
        </div>
        <div className="gads-campaign-actions">
          <GoogleSelect
            label="Ordenar campanhas"
            value={data.sort}
            onValueChange={(value) => onSort(value as GoogleMarketingSort)}
            options={[
              ...sortOptions,
              ...(data.scope.agency && data.scope.accountId ? metricSorts : []),
            ]}
            className="gads-campaign-sort"
          />
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="gads-control gads-columns-button">
                <Columns3 size={15} aria-hidden="true" />
                Colunas
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              collisionPadding={12}
              className="gads-popover gads-columns-panel"
              aria-label="Personalizar colunas"
            >
              <fieldset>
                <legend>Colunas da tabela</legend>
                {campaignColumns.map((column) => (
                  <label key={column.key} className="gads-column-option">
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(column.key)}
                      onChange={(event) =>
                        updateColumns(
                          toggleGoogleColumn(visibleColumns, column.key, event.target.checked),
                        )
                      }
                    />
                    <span>{column.label}</span>
                  </label>
                ))}
              </fieldset>
              <button
                type="button"
                className="gads-control gads-columns-reset"
                onClick={() => updateColumns(null)}
              >
                Restaurar padrão
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </header>
      {data.items.length ? (
        <div
          className="gads-campaign-scroll"
          role="region"
          aria-label="Tabela de campanhas, com rolagem horizontal"
          tabIndex={0}
        >
          <table className="gads-campaign-table">
            <caption className="sr-only">
              Campanhas Google Ads no escopo selecionado. Status registrado no Gestão. A ordenação
              considera todas as campanhas autorizadas, antes da paginação.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="gads-campaign-name-cell">
                  Campanha
                </th>
                {columns.map((column) => (
                  <th
                    scope="col"
                    key={column.key}
                    className={
                      column.key === "status" || column.key === "type"
                        ? "gads-campaign-text-cell"
                        : "gads-campaign-number"
                    }
                    title={column.key === "status" ? "Status registrado no Gestão" : undefined}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((campaign) => (
                <tr key={campaign.id}>
                  <th scope="row" className="gads-campaign-name-cell">
                    <button
                      type="button"
                      title={campaign.name}
                      className="gads-campaign-name"
                      ref={(element) => {
                        if (element) campaignButtons.current.set(campaign.id, element);
                        else campaignButtons.current.delete(campaign.id);
                      }}
                      onClick={() => onSelect(campaign.id)}
                    >
                      {campaign.name}
                    </button>
                    {campaign.coverage !== data.coverage && campaign.coverage !== "complete" && (
                      <span
                        className="gads-campaign-coverage"
                        title={
                          campaign.coverage === "unavailable"
                            ? "Não há coleta comprovada para esta campanha no período selecionado. Valores ausentes não são zero."
                            : "Os valores desta campanha representam apenas a coleta disponível no período."
                        }
                      >
                        <AlertCircle size={12} aria-hidden="true" />
                        {campaign.coverage === "partial" ? "Dados parciais" : "Sem coleta"}
                      </span>
                    )}
                  </th>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={
                        column.key === "status" || column.key === "type"
                          ? "gads-campaign-text-cell"
                          : "gads-campaign-number"
                      }
                    >
                      {column.key === "status" ? (
                        <span
                          className="gads-status-badge"
                          data-active={campaign.status === "Ativa"}
                          title="Status registrado no Gestão"
                        >
                          {campaign.status === "Pausada" ? (
                            <Pause size={12} aria-hidden="true" />
                          ) : campaign.status === "Ativa" ? (
                            <CirclePlay size={12} aria-hidden="true" />
                          ) : null}
                          {campaign.status || "Indisponível"}
                        </span>
                      ) : column.key === "type" ? (
                        (campaign.channelType ?? (
                          <span title="Tipo de campanha indisponível">—</span>
                        ))
                      ) : (
                        googleMetricLabel(
                          column.key,
                          campaign.metrics,
                          campaign.currency,
                          campaign.coverage,
                        )
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="gads-campaign-empty">
          <p>Nenhuma campanha encontrada neste escopo.</p>
        </div>
      )}
      {data.total > data.pageSize && (
        <nav className="gads-campaign-pagination" aria-label="Paginação das campanhas Google">
          <span>
            Página {data.page} de {Math.ceil(data.total / data.pageSize)}
          </span>
          <div>
            <button
              type="button"
              className="gads-control"
              disabled={data.page <= 1}
              onClick={() => onPage(data.page - 1)}
            >
              <ChevronLeft size={14} aria-hidden="true" />
              Anterior
            </button>
            <button
              type="button"
              className="gads-control"
              disabled={data.page * data.pageSize >= data.total}
              onClick={() => onPage(data.page + 1)}
            >
              Próxima
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}
    </section>
  );
}
