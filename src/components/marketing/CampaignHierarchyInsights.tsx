import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Info,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  function changeLevel(next: EntityInsightScope["level"]) {
    setLevel(next);
    setPage(1);
  }
  const rangeLabel = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    });
  return (
    <section
      className="mt-5 min-w-0 space-y-3 rounded-xl border bg-card p-4"
      aria-label="Resultados por nível da campanha"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Resultados por nível</h3>
        {allowed && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-10 sm:size-9"
                aria-label="Ações do nível selecionado"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 max-w-[calc(100vw-24px)] rounded-xl">
              <p className="mb-2 text-xs font-semibold text-foreground/70">
                {levels[level]} · {rangeLabel(range.since)}–{rangeLabel(range.until)}
              </p>
              <Button
                variant="ghost"
                className="h-11 w-full justify-start sm:h-9"
                disabled={!validRange || collect.isPending || Boolean(active)}
                onClick={() => collect.mutate()}
              >
                <RefreshCw className="size-4" />
                {collect.isPending ? "Solicitando coleta…" : "Solicitar coleta externa"}
              </Button>
              {query.data?.snapshotJobId && (
                <Button
                  variant="ghost"
                  className="h-11 w-full justify-start sm:h-9"
                  disabled={
                    pdf.isPending ||
                    (report?.jobId === query.data.snapshotJobId && report.status === "queued")
                  }
                  onClick={() => pdf.mutate(query.data!.snapshotJobId!)}
                >
                  <FileText className="size-4" />
                  {pdf.isPending ? "Solicitando PDF…" : "Gerar PDF deste nível"}
                </Button>
              )}
              {report?.jobId === query.data?.snapshotJobId && report?.status === "ready" && (
                <Button
                  variant="ghost"
                  className="h-11 w-full justify-start sm:h-9"
                  disabled={download.isPending}
                  onClick={() => download.mutate(report.id)}
                >
                  <Download className="size-4" />
                  Baixar PDF
                </Button>
              )}
              {query.data?.snapshotJobId && (
                <p className="mt-2 text-xs leading-relaxed text-foreground/65">
                  O PDF inclui todos os {query.data.total} registros do retrato completo.
                </p>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>
      <Breadcrumb aria-label="Hierarquia da campanha">
        <BreadcrumbList className="gap-1 text-xs sm:gap-1.5">
          <BreadcrumbItem>
            {level === "campaign" ? (
              <BreadcrumbPage>Campanha</BreadcrumbPage>
            ) : (
              <button
                type="button"
                className="min-h-9 rounded px-1 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => changeLevel("campaign")}
              >
                Campanha
              </button>
            )}
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            {level === "adset" ? (
              <BreadcrumbPage>Conjuntos</BreadcrumbPage>
            ) : level === "ad" ? (
              <button
                type="button"
                className="min-h-9 rounded px-1 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => changeLevel("adset")}
              >
                Conjuntos
              </button>
            ) : (
              <span>Conjuntos</span>
            )}
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            {level === "ad" ? <BreadcrumbPage>Anúncios</BreadcrumbPage> : <span>Anúncios</span>}
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Nível e detalhamento dos resultados"
      >
        <Select value={level} onValueChange={(value) => changeLevel(value as typeof level)}>
          <SelectTrigger
            className="h-11 w-auto min-w-36 rounded-lg bg-background sm:h-9"
            aria-label="Nível dos resultados"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(levels).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={breakdown}
          onValueChange={(value) => {
            setBreakdown(value as typeof breakdown);
            setPage(1);
          }}
        >
          <SelectTrigger
            className="h-11 w-auto min-w-44 rounded-lg bg-background sm:h-9"
            aria-label="Detalhamento por plataforma"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem detalhamento</SelectItem>
            <SelectItem value="publisher_platform">Por plataforma de entrega</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {report?.jobId === query.data?.snapshotJobId && report?.status === "queued" && (
        <p role="status" className="text-xs text-foreground/70">
          PDF solicitado. Acompanhe a geração em Relatórios.
        </p>
      )}
      {!validRange ? (
        <p className="text-sm text-foreground/70">
          Selecione até 94 dias para consultar conjuntos e anúncios.
        </p>
      ) : query.isLoading ? (
        <p role="status" className="text-sm">
          Consultando resultados…
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
            <p role={active ? "status" : undefined}>
              {query.data?.job
                ? `${coverageLabels[query.data.job.coverage] ?? "Coleta em andamento"}${active ? ` · ${query.data.job.progress}%` : ""}`
                : "Este nível ainda não foi coletado no período."}
            </p>
            {allowed && active && (
              <Button
                variant="ghost"
                className="h-11 px-2 text-xs sm:h-9"
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
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                A coleta recente não foi concluída. Exibindo o último retrato completo.
              </p>
            )}
          {query.data?.rows.length ? (
            <>
              <div
                className="overflow-x-auto rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                tabIndex={0}
                role="region"
                aria-label="Tabela de resultados por nível"
              >
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-foreground/70">
                      <th className="px-3 py-2.5">{levels[level]}</th>
                      <th className="px-3 py-2.5 text-right">Impressões</th>
                      <th className="px-3 py-2.5 text-right">Cliques</th>
                      <th className="px-3 py-2.5 text-right">Cliques no link</th>
                      <th className="px-3 py-2.5 text-right">Leads</th>
                      {query.data.financialVisible && (
                        <th className="whitespace-nowrap px-3 py-2.5 text-right">
                          Investimento ({query.data.currency || "—"})
                        </th>
                      )}
                      <th className="px-3 py-2.5 text-right">Alcance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.rows.map((row, index) => (
                      <tr
                        className="border-b last:border-0 hover:bg-muted/20"
                        key={`${row.entityId}:${index}`}
                      >
                        <td className="max-w-48 px-3 py-2.5">
                          <span className="break-words font-medium">ID {row.entityId}</span>
                          {row.breakdown.publisher_platform && (
                            <span className="mt-1 block text-foreground/70">
                              {row.breakdown.publisher_platform}
                            </span>
                          )}
                          {row.adsetId && level === "ad" && (
                            <span className="mt-1 block text-foreground/65">
                              Conjunto {row.adsetId}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {number(row.impressions)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {number(row.clicks)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {number(row.inlineLinkClicks)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{number(row.leads)}</td>
                        {query.data!.financialVisible && (
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {number(row.spend)}
                          </td>
                        )}
                        <td className="px-3 py-2.5 text-right tabular-nums">{number(row.reach)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 text-xs text-foreground/70">
                  <span>
                    {query.data.total} registros · página {page}
                  </span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9"
                        aria-label="Indicadores e escopo desta página"
                      >
                        <Info className="size-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="max-w-[calc(100vw-24px)] rounded-xl text-xs leading-relaxed">
                      <p>
                        CTR ponderado desta página:{" "}
                        {totals?.ctr == null ? "—" : `${number(totals.ctr)}%`}. Alcance não é
                        somado.
                      </p>
                      <p className="mt-2">
                        Família de leads: {totals?.leadActionType || "não comparável entre linhas"}.
                      </p>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-11 sm:size-9"
                    aria-label="Página anterior de resultados"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-11 sm:size-9"
                    aria-label="Próxima página de resultados"
                    disabled={page * 25 >= query.data.total}
                    onClick={() => setPage(page + 1)}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-foreground/70">
              {query.data?.job?.coverage === "collected_empty"
                ? "Nenhum resultado neste período."
                : "Ainda sem resultados completos para este nível."}
            </p>
          )}
          <details className="text-xs text-foreground/70">
            <summary className="inline-flex min-h-9 cursor-pointer items-center rounded font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              Detalhes do recorte
            </summary>
            <dl className="mt-2 space-y-2">
              <div>
                <dt className="font-semibold">Período</dt>
                <dd>
                  {range.since} a {range.until} ·{" "}
                  {query.data?.timezone || "Fuso da conta não informado"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Último retrato completo</dt>
                <dd>
                  {query.data?.snapshotAt
                    ? new Date(query.data.snapshotAt).toLocaleString("pt-BR")
                    : "Indisponível. Ausência de coleta não representa zero."}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">API e atribuição</dt>
                <dd>
                  {query.data?.apiVersion || "Versão não informada"} ·{" "}
                  {query.data?.rows.some((row) => row.attribution)
                    ? [
                        ...new Set(query.data.rows.map((row) => row.attribution).filter(Boolean)),
                      ].join(" · ")
                    : "Janela efetiva não verificada"}
                </dd>
              </div>
            </dl>
          </details>
        </>
      )}
    </section>
  );
}
