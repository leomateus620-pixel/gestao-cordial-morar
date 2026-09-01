import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  useControlPropertyImport,
  useImportOverview,
  useStartPropertyImport,
} from "@/hooks/usePropertyImport";
import { useProvidersHealth } from "@/hooks/usePropertySync";
import { ImportConflictsDialog } from "./ImportConflictsDialog";

const PROVIDER_LABEL: Record<string, string> = { cordial: "Cordial", morar: "Morar" };
const MODE_LABEL: Record<string, string> = {
  dry_run: "Análise",
  commit: "Importação definitiva",
  incremental: "Incremental",
};
const STATUS_LABEL: Record<string, string> = {
  queued: "Na fila",
  running: "Em andamento",
  paused: "Pausada",
  completed: "Concluída",
  completed_with_errors: "Concluída com erros",
  failed: "Falhou",
  cancelled: "Cancelada",
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white/55 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-foreground/45">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** Ícone compacto no header: abre o painel completo de sincronização (somente admin). */
export function SiteSyncPanel({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const overview = useImportOverview(isAdmin && open);
  const health = useProvidersHealth(isAdmin && open);
  const start = useStartPropertyImport();
  const control = useControlPropertyImport();

  if (!isAdmin) return null;

  const runs = overview.data?.runs ?? [];
  const linked = overview.data?.linked ?? [];

  const trigger = async (providers: string[], mode: "dry_run" | "commit") => {
    try {
      const result = await start.mutateAsync({ providers, mode });
      if (result.started.length) {
        toast.success(
          mode === "dry_run"
            ? "Análise iniciada. O progresso continua mesmo se você fechar a página."
            : "Importação iniciada. Acompanhe o progresso abaixo.",
        );
      }
      for (const failure of result.failed) {
        toast.error(`${PROVIDER_LABEL[failure.provider]}: ${failure.error}`);
      }
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Sincronização dos sites"
        title="Sincronização dos sites"
        className="glass-panel grid size-9 shrink-0 place-items-center rounded-full text-primary transition hover:bg-white/70"
      >
        <RefreshCw className={`size-4 ${overview.isFetching ? "animate-spin" : ""}`} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] w-[min(96vw,42rem)] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>Sincronização dos sites</DialogTitle>
            <DialogDescription>
              Saúde da conexão com Cordial e Morar e importação do catálogo.
            </DialogDescription>
          </DialogHeader>
        <div className="space-y-4">

          <div className="grid gap-2 sm:grid-cols-2">
            {(health.data?.accounts ?? []).map((account: Record<string, unknown>) => {
              const ok = Boolean(account["ok"]);
              const provider = String(account["provider"] ?? "");
              const link = linked.find((item) => item.provider === provider);
              return (
                <div key={provider} className="rounded-2xl bg-white/55 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold">
                    {ok ? (
                      <CheckCircle2 className="size-3.5 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="size-3.5 text-amber-600" />
                    )}
                    {PROVIDER_LABEL[provider] ?? provider}
                    <span className="font-normal text-foreground/50">
                      {ok ? "conectado" : "sem conexão"}
                    </span>
                  </p>
                  <p className="mt-1 text-[11px] text-foreground/55">
                    {link ? `${link.linked} vinculados · ${link.published} publicados` : "Sem vínculos"}
                    {link && link.outOfSync > 0 ? ` · ${link.outOfSync} divergentes` : ""}
                  </p>
                </div>
              );
            })}
            {health.isPending && (
              <div className="flex items-center gap-2 rounded-2xl bg-white/55 px-3 py-2.5 text-xs text-foreground/50">
                <Loader2 className="size-3.5 animate-spin" /> Verificando conexão com os sites…
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => trigger(["cordial", "morar"], "dry_run")}
              disabled={start.isPending}
              className="flex items-center gap-1.5 rounded-full bg-foreground/[0.06] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              <Search className="size-3.5" /> Analisar importação
            </button>
            <button
              onClick={() => trigger(["cordial", "morar"], "commit")}
              disabled={start.isPending}
              className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Play className="size-3.5" /> Iniciar importação
            </button>
            <button
              onClick={() => setConflictsOpen(true)}
              className="flex items-center gap-1.5 rounded-full bg-amber-500/12 px-3 py-1.5 text-xs font-semibold text-amber-700"
            >
              <AlertTriangle className="size-3.5" /> Ver conflitos ({overview.data?.conflicts ?? 0})
            </button>
          </div>

          <div className="space-y-3">
            {runs.length === 0 && (
              <p className="text-[11px] text-foreground/50">
                Nenhuma importação executada ainda. Comece por “Analisar importação” — a análise não
                altera nada no catálogo nem nos sites.
              </p>
            )}
            {runs.map((run) => (
              <div key={run.id} className="rounded-2xl bg-white/55 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold">
                    {PROVIDER_LABEL[run.provider] ?? run.provider} · {MODE_LABEL[run.mode] ?? run.mode}
                  </p>
                  <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-semibold">
                    {STATUS_LABEL[run.status] ?? run.status}
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Páginas" value={`${run.pagesProcessed}/${run.pagesDiscovered || "?"}`} />
                  <Stat label="Imóveis" value={run.propertiesDiscovered} />
                  <Stat label="Criados / vinculados" value={`${run.propertiesCreated}/${run.propertiesLinked}`} />
                  <Stat label="Imagens" value={`${run.imagesImported}/${run.imagesDiscovered}`} />
                </div>

                {(run.propertiesAmbiguous > 0 || run.propertiesErrored > 0 || run.imagesErrored > 0) && (
                  <p className="mt-2 text-[11px] text-amber-700">
                    {run.propertiesAmbiguous} para revisão · {run.propertiesErrored} com erro ·{" "}
                    {run.imagesErrored} imagens com erro
                  </p>
                )}

                <div className="mt-2 flex flex-wrap gap-2">
                  {run.status === "running" || run.status === "queued" ? (
                    <button
                      onClick={() => control.mutate({ runId: run.id, action: "pause" })}
                      className="flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[11px] font-semibold"
                    >
                      <Pause className="size-3" /> Pausar
                    </button>
                  ) : run.status === "paused" ? (
                    <button
                      onClick={() => control.mutate({ runId: run.id, action: "resume" })}
                      className="flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[11px] font-semibold"
                    >
                      <Play className="size-3" /> Retomar
                    </button>
                  ) : null}
                  {run.failedJobs > 0 && (
                    <button
                      onClick={() => control.mutate({ runId: run.id, action: "retry_errors" })}
                      className="flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[11px] font-semibold"
                    >
                      <RotateCcw className="size-3" /> Tentar erros novamente ({run.failedJobs})
                    </button>
                  )}
                  <span className="self-center text-[10px] text-foreground/45">
                    {run.pendingJobs} tarefa(s) na fila
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        </DialogContent>
      </Dialog>

      <ImportConflictsDialog open={conflictsOpen} onOpenChange={setConflictsOpen} />
    </>

  );
}
