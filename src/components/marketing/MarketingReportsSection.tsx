import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-mock";
import {
  previewMarketingReport,
  generateMarketingReport,
  listMarketingReports,
  downloadMarketingReport,
} from "@/lib/marketing/reports.functions";
import type { MarketingReportScope } from "@/lib/marketing/report-model";

const labels = {
  executive: "Executivo",
  detailed: "Desempenho detalhado",
  funnel: "Funil e origem dos leads",
};
export function MarketingReportsSection({
  imobiliaria,
  filters,
}: {
  imobiliaria: "cordial" | "morar" | "todas";
  filters: MarketingReportScope["filters"];
}) {
  const session = useSession();
  const allowed = session?.perfil === "admin_owner" || session?.perfil === "secretaria";
  const [type, setType] = useState<MarketingReportScope["type"]>("executive");
  const [previewOpen, setPreviewOpen] = useState(false);
  const qc = useQueryClient();
  const preview = useServerFn(previewMarketingReport),
    generate = useServerFn(generateMarketingReport),
    list = useServerFn(listMarketingReports),
    download = useServerFn(downloadMarketingReport);
  const scope = {
    imobiliaria: imobiliaria === "todas" ? ("cordial" as const) : imobiliaria,
    type,
    filters,
  };
  const history = useQuery({
    queryKey: ["marketing", "reports", session?.id, session?.perfil, imobiliaria],
    queryFn: () => list({ data: { imobiliaria: scope.imobiliaria } }),
    enabled: allowed && imobiliaria !== "todas",
    staleTime: 30_000,
    refetchInterval: (query) =>
      query.state.data?.some((report) =>
        ["queued", "processing", "generating"].includes(report.status),
      )
        ? 5000
        : false,
  });
  const snapshot = useQuery({
    queryKey: ["marketing", "report-preview", session?.id, session?.perfil, scope],
    queryFn: () => preview({ data: scope }),
    enabled: allowed && imobiliaria !== "todas" && previewOpen,
    staleTime: 30_000,
  });
  const generation = useMutation({
    mutationFn: () => generate({ data: scope }),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["marketing", "reports"] });
      if (result.status === "ready")
        toast.success("Relatório gerado e registrado no histórico privado.");
      else toast("Relatório solicitado. Acompanhe a geração no histórico privado.");
    },
    onError: () =>
      toast.error("Não foi possível gerar o relatório. Confira o escopo e tente novamente."),
  });
  const downloading = useMutation({
    mutationFn: async (id: string) => {
      const result = await download({ data: { id } });
      window.open(result.url, "_blank", "noopener,noreferrer");
    },
    onError: () =>
      toast.error(
        "O arquivo não está disponível para este perfil. Atualize o histórico e tente novamente.",
      ),
  });
  if (!allowed)
    return (
      <section className="border-y py-8">
        <h2 className="font-display text-lg font-semibold">Relatórios com acesso restrito</h2>
        <p className="mt-2 text-sm text-foreground/70">
          A geração e o download exigem autorização operacional. Os resultados agregados continuam
          disponíveis na Visão geral.
        </p>
      </section>
    );
  if (imobiliaria === "todas")
    return (
      <section className="border-y py-8">
        <h2 className="font-display text-lg font-semibold">Selecione uma imobiliária</h2>
        <p className="mt-2 text-sm text-foreground/70">
          Use o filtro acima para definir o escopo do relatório privado. Conta, plataforma e período
          serão preservados.
        </p>
      </section>
    );
  return (
    <section className="space-y-5" aria-label="Relatórios privados de Marketing">
      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <label className="flex flex-col gap-2 text-sm font-semibold">
          Relatório
          <select
            className="h-11 rounded-xl border border-foreground/55 bg-card px-3 font-normal"
            value={type}
            onChange={(event) => {
              setType(event.target.value as typeof type);
              setPreviewOpen(false);
            }}
          >
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => setPreviewOpen((open) => !open)}
          >
            {previewOpen ? "Fechar prévia" : "Revisar escopo"}
          </Button>
          <Button
            className="min-h-11"
            disabled={generation.isPending}
            onClick={() => generation.mutate()}
          >
            {generation.isPending ? (
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <FileText className="size-4" />
            )}
            Gerar PDF
          </Button>
        </div>
      </div>
      <p className="text-sm text-foreground/75">
        <strong className="capitalize">{imobiliaria}</strong> ·{" "}
        {filters.accountId ? `Conta ${filters.accountId}` : "Todas as contas autorizadas"} ·{" "}
        {filters.since} a {filters.until}
        {filters.platform ? ` · ${filters.platform}` : ""}
      </p>
      {generation.isPending && (
        <p role="status" className="text-sm text-primary">
          Gerando o documento a partir de um retrato completo do filtro. Você pode continuar
          navegando.
        </p>
      )}
      {previewOpen && (
        <section className="rounded-xl border bg-card p-4" aria-label="Prévia do relatório">
          {snapshot.isLoading ? (
            <p role="status">Preparando prévia…</p>
          ) : snapshot.isError ? (
            <p role="alert" className="text-sm text-red-800">
              Não foi possível carregar o retrato do relatório.{" "}
              <button className="min-h-11 underline" onClick={() => void snapshot.refetch()}>
                Tentar novamente
              </button>
            </p>
          ) : (
            snapshot.data && (
              <>
                <h3 className="font-semibold">{labels[type]}</h3>
                <p className="mt-2 text-sm">
                  {snapshot.data.total} campanhas ·{" "}
                  {snapshot.data.financialVisible
                    ? "Inclui valores financeiros autorizados"
                    : "Sem valores financeiros"}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <PreviewValue
                    label="Leads reportados"
                    value={
                      snapshot.data.kpis.hasData ? String(snapshot.data.kpis.leads) : "Indisponível"
                    }
                  />
                  <PreviewValue
                    label="Submissões recebidas"
                    value={String(snapshot.data.funnel.submissions)}
                  />
                  <PreviewValue
                    label="Atendimentos únicos"
                    value={String(snapshot.data.funnel.attendances)}
                  />
                  <PreviewValue
                    label="Campanhas com dados"
                    value={`${snapshot.data.coverage.data ?? 0} de ${snapshot.data.total}`}
                  />
                </div>
                <p className="mt-4 text-xs text-foreground/70">
                  {snapshot.data.timezones.join(" · ") || "Fuso não informado"} · Retrato de{" "}
                  {new Date(snapshot.data.capturedAt).toLocaleString("pt-BR")}. O PDF cobre todas as
                  campanhas autorizadas no filtro.
                </p>
              </>
            )
          )}
        </section>
      )}
      <div>
        <h3 className="font-display text-lg font-semibold">Histórico privado</h3>
        {history.isLoading ? (
          <p className="py-5 text-sm" role="status">
            Carregando relatórios…
          </p>
        ) : history.isError ? (
          <p className="py-5 text-sm text-red-800" role="alert">
            Não foi possível carregar o histórico.{" "}
            <button className="min-h-11 underline" onClick={() => void history.refetch()}>
              Tentar novamente
            </button>
          </p>
        ) : !history.data?.length ? (
          <p className="py-5 text-sm text-foreground/70">
            Nenhum relatório gerado para esta imobiliária.
          </p>
        ) : (
          <ul className="mt-3 divide-y">
            {history.data.map((report) => (
              <li
                key={report.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {labels[report.kind as keyof typeof labels] ?? "Relatório de Marketing"}
                  </p>
                  <p className="mt-1 text-xs text-foreground/70">
                    {new Date(report.created_at).toLocaleString("pt-BR")} ·{" "}
                    {report.status === "ready"
                      ? "Disponível"
                      : report.status === "failed"
                        ? "Falha na geração"
                        : report.status === "queued"
                          ? "Na fila de geração"
                          : "Gerando arquivo"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={report.status !== "ready" || downloading.isPending}
                  onClick={() => downloading.mutate(report.id)}
                >
                  <Download className="size-4" />
                  Baixar PDF
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
function PreviewValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-foreground/70">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
