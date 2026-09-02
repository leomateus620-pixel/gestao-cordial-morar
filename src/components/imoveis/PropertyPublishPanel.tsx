import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import {
  useEnqueuePropertySync,
  usePropertySyncStatus,
  useReconcileProperty,
  useRetryPropertySync,
} from "@/hooks/usePropertySync";

const PROVIDERS = [
  { key: "cordial", label: "Cordial Imóveis" },
  { key: "morar", label: "Morar Imóveis" },
] as const;

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-foreground/8 text-foreground/60" },
  pending: { label: "Na fila", className: "bg-amber-500/12 text-amber-700" },
  syncing: { label: "Sincronizando", className: "bg-sky-500/12 text-sky-700" },
  partial: { label: "Parcial", className: "bg-amber-500/15 text-amber-700" },
  published: { label: "Publicado", className: "bg-emerald-500/12 text-emerald-700" },
  unpublished: { label: "Despublicado", className: "bg-foreground/8 text-foreground/60" },
  error: { label: "Erro", className: "bg-destructive/12 text-destructive" },
  out_of_sync: { label: "Divergente", className: "bg-destructive/10 text-destructive" },
};

export function PropertyPublishPanel({
  propertyId,
  canPublish,
  isAdmin,
}: {
  propertyId: string;
  canPublish: boolean;
  isAdmin: boolean;
}) {
  const status = usePropertySyncStatus(propertyId);
  const enqueue = useEnqueuePropertySync(propertyId);
  const retry = useRetryPropertySync(propertyId);
  const reconcile = useReconcileProperty(propertyId);
  const [selected, setSelected] = useState<string[]>([]);

  const byProvider = useMemo(
    () => new Map((status.data ?? []).map((row) => [row.provider, row])),
    [status.data],
  );

  function toggle(provider: string) {
    setSelected((prev) =>
      prev.includes(provider) ? prev.filter((p) => p !== provider) : [...prev, provider],
    );
  }

  async function run(action: "publish" | "unpublish", providers: string[]) {
    if (!providers.length) {
      toast.error("Selecione ao menos um destino.");
      return;
    }
    try {
      const result = (await enqueue.mutateAsync({ propertyId, providers, action })) as {
        skippedImages?: number;
        pendingImages?: number;
      };
      const outOfSync = (result?.skippedImages ?? 0) + (result?.pendingImages ?? 0);
      toast.success(
        action === "publish"
          ? "Publicação enfileirada. Acompanhe o status abaixo."
          : "Despublicação enfileirada.",
        outOfSync > 0
          ? { description: `${outOfSync} foto(s) ficaram de fora: sem marca-d'água concluída.` }
          : undefined,
      );
      setSelected([]);
    } catch (error) {
      toast.error((error as Error)?.message ?? "Não foi possível enfileirar a sincronização.");
    }
  }

  return (
    <section className="glass-panel rounded-3xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <CloudUpload className="size-4 text-primary" />
          Publicação nos sites
        </h2>
        {status.isFetching && <Loader2 className="size-3.5 animate-spin text-foreground/35" />}
      </div>

      <div className="mt-3 space-y-2">
        {PROVIDERS.map((provider) => {
          const row = byProvider.get(provider.key);
          const meta = STATUS_META[row?.status ?? "draft"] ?? STATUS_META["draft"]!;
          const job = row?.activeJob ?? null;
          const attempts = job?.attempts ?? 0;
          // Estado honesto: o job em curso manda no rótulo, não o status antigo.
          const liveMeta = job
            ? job.status === "processing"
              ? { label: "Enviando", className: "bg-sky-500/12 text-sky-700" }
              : job.status === "retry"
                ? { label: "Reenviando", className: "bg-amber-500/15 text-amber-700" }
                : { label: "Na fila", className: "bg-amber-500/12 text-amber-700" }
            : meta;
          return (
            <div key={provider.key} className="rounded-2xl bg-white/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                {canPublish && (
                  <input
                    type="checkbox"
                    checked={selected.includes(provider.key)}
                    onChange={() => toggle(provider.key)}
                    className="size-4 accent-[hsl(var(--primary))]"
                    aria-label={`Selecionar ${provider.label}`}
                  />
                )}
                <span className="text-sm font-semibold">{provider.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${liveMeta.className}`}
                >
                  {liveMeta.label}
                </span>
                {attempts > 0 && (
                  <span className="text-[10px] font-semibold text-foreground/45">
                    {attempts} tentativa{attempts > 1 ? "s" : ""}
                  </span>
                )}
                {row?.externalPropertyId && (
                  <span className="font-mono text-[10px] text-foreground/45">
                    #{row.externalPropertyId}
                  </span>
                )}
                {row?.externalPublicUrl && (
                  <a
                    href={row.externalPublicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary"
                  >
                    Ver anúncio <ExternalLink className="size-3" />
                  </a>
                )}
              </div>

              {row?.lastErrorMessage && (
                <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-destructive/8 p-2 text-[11px] text-destructive">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  {/1500 caracteres/i.test(row.lastErrorMessage)
                    ? "A descrição passava do limite do site (1500 caracteres). Agora ela é encurtada automaticamente no fim — clique em Reprocessar para publicar."
                    : row.lastErrorMessage}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-foreground/45">
                {row?.lastSyncedAt && (
                  <span>Última sincronização: {new Date(row.lastSyncedAt).toLocaleString("pt-BR")}</span>
                )}
                {row?.lastVerifiedAt && (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="size-3" />
                    verificado
                  </span>
                )}
              </div>

              {canPublish && row && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(row.status === "error" ||
                    row.status === "partial" ||
                    row.status === "out_of_sync" ||
                    Boolean(row.lastErrorMessage)) && (
                    <button
                      onClick={() =>
                        retry
                          .mutateAsync({ propertyId, provider: provider.key })
                          .then(() => toast.success("Reprocessamento solicitado."))
                          .catch((error: Error) => toast.error(error.message))
                      }
                      className="inline-flex items-center gap-1.5 rounded-full bg-foreground/8 px-3 py-1.5 text-[11px] font-semibold"
                    >
                      <RotateCcw className="size-3" /> Reprocessar
                    </button>
                  )}
                  {row.status === "published" && (
                    <button
                      onClick={() => run("unpublish", [provider.key])}
                      className="rounded-full bg-foreground/8 px-3 py-1.5 text-[11px] font-semibold"
                    >
                      Despublicar
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() =>
                        reconcile
                          .mutateAsync({ propertyId, provider: provider.key })
                          .then(() => toast.success("Reconciliação solicitada."))
                          .catch((error: Error) => toast.error(error.message))
                      }
                      className="inline-flex items-center gap-1.5 rounded-full bg-foreground/8 px-3 py-1.5 text-[11px] font-semibold"
                    >
                      <RefreshCw className="size-3" /> Reconciliar
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canPublish && (
        <button
          onClick={() => run("publish", selected)}
          disabled={enqueue.isPending || selected.length === 0}
          className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 disabled:opacity-40"
        >
          {enqueue.isPending ? "Enfileirando…" : "Publicar / atualizar selecionados"}
        </button>
      )}

    </section>
  );
}
