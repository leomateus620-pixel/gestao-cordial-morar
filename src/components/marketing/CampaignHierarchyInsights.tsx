import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-mock";
import {
  listMetaEntityInsights,
  enqueueMetaEntityInsights,
  cancelMetaEntityInsights,
  type EntityInsightScope,
} from "@/lib/ads/entity-insights.functions";
import { generateMetaEntityReport } from "@/lib/ads/entity-report.functions";
import { downloadMarketingReport } from "@/lib/marketing/reports.functions";
import { entityInsightTotals } from "@/lib/ads/entity-insights.model";

const levels = { campaign: "Campanha", adset: "Conjuntos", ad: "Anúncios" };
const coverageLabels: Record<string, string> = {
  pending: "Coleta pendente",
  collected_data: "Coletado com dados",
  collected_empty: "Coletado sem dados no recorte",
  partial: "Coleta parcial",
  error: "Erro na coleta",
};
export function CampaignHierarchyInsights({
  campaignId,
  range,
}: {
  campaignId: string;
  range: { since: string; until: string };
}) {
  const session = useSession(),
    qc = useQueryClient();
  const allowed = session?.perfil === "admin_owner" || session?.perfil === "secretaria";
  const [level, setLevel] = useState<EntityInsightScope["level"]>("campaign"),
    [page, setPage] = useState(1);
  const [breakdown, setBreakdown] = useState<"none" | "publisher_platform">("none");
  const list = useServerFn(listMetaEntityInsights),
    enqueue = useServerFn(enqueueMetaEntityInsights),
    cancel = useServerFn(cancelMetaEntityInsights);
  const scope = {
    campaignId,
    level,
    since: range.since,
    until: range.until,
    grain: "period" as const,
    breakdown,
  };
  const validRange = Date.parse(range.until) - Date.parse(range.since) <= 93 * 86400000;
  const query = useQuery({
    queryKey: ["marketing", "entity-insights", session?.id, session?.perfil, scope, page],
    queryFn: () => list({ data: { ...scope, page, pageSize: 25 } }),
    enabled: Boolean(session) && validRange,
    staleTime: 30_000,
    refetchInterval: (q) =>
      q.state.data?.job &&
      ["queued", "submitting", "polling", "collecting"].includes(q.state.data.job.status)
        ? 5000
        : false,
  });
  const generateReport = useServerFn(generateMetaEntityReport),
    downloadReport = useServerFn(downloadMarketingReport);
  const [report, setReport] = useState<{
    jobId: string;
    id: string;
    status: "ready" | "queued";
  } | null>(null);
  const pdf = useMutation({
    mutationFn: (jobId: string) => generateReport({ data: { jobId } }),
    onSuccess: (result, jobId) => {
      setReport({ jobId, id: result.id, status: result.status });
      void qc.invalidateQueries({ queryKey: ["marketing", "reports"] });
      if (result.status === "ready")
        toast.success("PDF do retrato completo gerado no histórico privado.");
      else toast("PDF solicitado. Acompanhe a geração no histórico privado em Relatórios.");
    },
    onError: () => toast.error("Não foi possível gerar o PDF deste retrato."),
  });
  const download = useMutation({
    mutationFn: async (id: string) => {
      const result = await downloadReport({ data: { id } });
      window.open(result.url, "_blank", "noopener,noreferrer");
    },
    onError: () => toast.error("Não foi possível autorizar o download."),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["marketing", "entity-insights"] });
  const collect = useMutation({
    mutationFn: () => enqueue({ data: scope }),
    onSuccess: () => {
      refresh();
      toast("Coleta do recorte agendada. Nenhuma configuração de anúncio foi alterada.");
    },
    onError: () => toast.error("Não foi possível agendar. Confira o acesso e o período."),
  });
  const stop = useMutation({
    mutationFn: (id: string) => cancel({ data: { id } }),
    onSuccess: refresh,
    onError: () => toast.error("Não foi possível interromper a coleta."),
  });
  const totals = query.data ? entityInsightTotals(query.data.rows, query.data.currency) : null;
  const number = (value: string | number | null | undefined) =>
    value === null || value === undefined
      ? "—"
      : Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const active =
    query.data?.job &&
    ["queued", "submitting", "polling", "collecting"].includes(query.data.job.status);
  return (
    <section className="mt-5 space-y-4 border-t py-4" aria-label="Resultados por nível da campanha">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold">Campanha, conjuntos e anúncios</h3>
        {allowed && (
          <Button
            variant="outline"
            className="min-h-11"
            disabled={!validRange || collect.isPending || Boolean(active)}
            onClick={() => collect.mutate()}
          >
            <RefreshCw className="size-4" />
            Coletar este recorte
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Nível dos resultados">
        {Object.entries(levels).map(([key, label]) => (
          <Button
            key={key}
            variant={level === key ? "default" : "outline"}
            className="min-h-11"
            aria-pressed={level === key}
            onClick={() => {
              setLevel(key as typeof level);
              setPage(1);
            }}
          >
            {label}
          </Button>
        ))}
        <select
          aria-label="Detalhamento por plataforma"
          className="h-11 rounded-xl border border-foreground/55 bg-card px-3 text-sm"
          value={breakdown}
          onChange={(event) => {
            setBreakdown(event.target.value as typeof breakdown);
            setPage(1);
          }}
        >
          <option value="none">Sem detalhamento</option>
          <option value="publisher_platform">Por plataforma de entrega</option>
        </select>
      </div>
      {allowed && query.data?.snapshotJobId && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={
              pdf.isPending ||
              (report?.jobId === query.data.snapshotJobId && report.status === "queued")
            }
            onClick={() => pdf.mutate(query.data!.snapshotJobId!)}
          >
            {pdf.isPending ? "Gerando PDF…" : "Gerar PDF deste nível"}
          </Button>
          {report?.jobId === query.data.snapshotJobId && report.status === "ready" && (
            <Button
              variant="outline"
              className="min-h-11"
              disabled={download.isPending}
              onClick={() => download.mutate(report.id)}
            >
              Baixar PDF
            </Button>
          )}
          {report?.jobId === query.data.snapshotJobId && report.status === "queued" && (
            <p role="status" className="text-xs text-foreground/70">
              Solicitado. Acompanhe o histórico privado em Relatórios.
            </p>
          )}
          <span className="text-xs text-foreground/70">
            Exporta todos os {query.data.total} registros do retrato completo.
          </span>
        </div>
      )}
      {!validRange ? (
        <p className="text-sm text-foreground/70">
          Selecione até 94 dias para coletar e consultar o detalhamento por conjunto e anúncio.
        </p>
      ) : query.isLoading ? (
        <p role="status" className="text-sm">
          Consultando resultados armazenados…
        </p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-red-800">
          Não foi possível carregar o detalhamento.{" "}
          <button className="min-h-11 underline" onClick={() => void query.refetch()}>
            Tentar novamente
          </button>
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/70">
            <p>
              {query.data?.job
                ? `${coverageLabels[query.data.job.coverage] ?? "Coleta em andamento"} · ${query.data.job.progress}%`
                : "Este nível ainda não foi coletado neste período."}
              {query.data?.snapshotAt
                ? ` · Dados de ${new Date(query.data.snapshotAt).toLocaleString("pt-BR")}`
                : ""}
            </p>
            {allowed && active && (
              <Button
                variant="ghost"
                className="min-h-11"
                disabled={stop.isPending}
                onClick={() => stop.mutate(query.data!.job!.id)}
              >
                Interromper coleta
              </Button>
            )}
          </div>
          {query.data?.job &&
            ["partial", "error"].includes(query.data.job.coverage) &&
            query.data.snapshotJobId && (
              <p className="text-xs text-amber-900">
                A coleta recente não foi concluída. O último retrato completo continua disponível
                abaixo.
              </p>
            )}
          {query.data?.rows.length ? (
            <>
              <div
                className="overflow-x-auto rounded-xl border"
                tabIndex={0}
                aria-label="Tabela de resultados por nível"
              >
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-foreground/70">
                      <th className="p-3">{levels[level]}</th>
                      <th className="p-3 text-right">Impressões</th>
                      <th className="p-3 text-right">Todos os cliques</th>
                      <th className="p-3 text-right">Cliques no link</th>
                      <th className="p-3 text-right">Leads</th>
                      {query.data.financialVisible && (
                        <th className="p-3 text-right">
                          Investimento ({query.data.currency || "—"})
                        </th>
                      )}
                      <th className="p-3 text-right">Alcance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.rows.map((row, index) => (
                      <tr className="border-b last:border-0" key={`${row.entityId}:${index}`}>
                        <td className="p-3">
                          <span className="font-semibold">ID {row.entityId}</span>
                          {row.breakdown.publisher_platform && (
                            <span className="mt-1 block">{row.breakdown.publisher_platform}</span>
                          )}
                          {row.adsetId && level === "ad" && (
                            <span className="mt-1 block text-foreground/65">
                              Conjunto {row.adsetId}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right tabular-nums">{number(row.impressions)}</td>
                        <td className="p-3 text-right tabular-nums">{number(row.clicks)}</td>
                        <td className="p-3 text-right tabular-nums">
                          {number(row.inlineLinkClicks)}
                        </td>
                        <td className="p-3 text-right tabular-nums">{number(row.leads)}</td>
                        {query.data!.financialVisible && (
                          <td className="p-3 text-right tabular-nums">{number(row.spend)}</td>
                        )}
                        <td className="p-3 text-right tabular-nums">{number(row.reach)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-foreground/70">
                {query.data.total} registros · página {page} · CTR ponderado desta página:{" "}
                {totals?.ctr === null ? "—" : `${number(totals?.ctr)}%`}. Alcance não somado.
                Família de leads: {totals?.leadActionType || "não comparável entre linhas"}.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-11"
                  aria-label="Página anterior de resultados"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-11"
                  aria-label="Próxima página de resultados"
                  disabled={page * 25 >= query.data.total}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-dashed p-4 text-sm text-foreground/70">
              {query.data?.job?.coverage === "collected_empty"
                ? "Consulta completa sem resultados no recorte. Isso não indica uma campanha defeituosa."
                : "Sem resultados completos para exibir. Ausência de coleta não representa zero."}
            </p>
          )}
          <p className="text-xs text-foreground/70">
            {range.since} a {range.until} · {query.data?.timezone || "Fuso da conta não informado"}{" "}
            · {query.data?.apiVersion || "Versão não informada"}. Atribuição:{" "}
            {query.data?.rows.some((row) => row.attribution)
              ? [...new Set(query.data.rows.map((row) => row.attribution).filter(Boolean))].join(
                  " · ",
                )
              : "janela efetiva não verificada"}
            .
          </p>
        </>
      )}
    </section>
  );
}
