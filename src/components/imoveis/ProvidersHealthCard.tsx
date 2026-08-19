import { toast } from "sonner";
import { Activity, AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { useProvidersHealth, useRefreshProviderCatalogs } from "@/hooks/usePropertySync";

/** Painel de saúde das APIs ImobiBrasil + fila de publicação. Somente administradores. */
export function ProvidersHealthCard({ enabled }: { enabled: boolean }) {
  const health = useProvidersHealth(enabled);
  const refresh = useRefreshProviderCatalogs();

  if (!enabled) return null;

  return (
    <section className="glass-panel mb-4 rounded-3xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Activity className="size-4 text-primary" />
          Publicação de imóveis (Cordial · Morar)
        </h2>
        {health.isFetching && <Loader2 className="size-3.5 animate-spin text-foreground/35" />}
      </div>

      {health.isError && (
        <p className="mt-2 text-[11px] text-destructive">
          {(health.error as Error)?.message ?? "Falha ao consultar o status."}
        </p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {(health.data?.accounts ?? []).map((account) => (
          <div key={account.provider} className="rounded-2xl bg-white/50 p-3">
            <div className="flex items-center gap-2">
              {account.ok ? (
                <CheckCircle2 className="size-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="size-4 text-destructive" />
              )}
              <span className="text-sm font-semibold capitalize">{account.provider}</span>
            </div>
            <p className="mt-1 text-[11px] text-foreground/55">{account.message}</p>
            <button
              onClick={() =>
                refresh
                  .mutateAsync({ provider: account.provider })
                  .then(() => toast.success("Catálogos atualizados."))
                  .catch((error: Error) => toast.error(error.message))
              }
              disabled={refresh.isPending}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-foreground/8 px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40"
            >
              <RefreshCw className="size-3" /> Atualizar catálogos
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-foreground/55">
        <span>Na fila: <strong>{health.data?.queue.pending ?? 0}</strong></span>
        <span>Falhas: <strong>{health.data?.queue.failed ?? 0}</strong></span>
      </div>
    </section>
  );
}
