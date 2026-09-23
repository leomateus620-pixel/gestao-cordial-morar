import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CloudUpload, ExternalLink, Loader2 } from "lucide-react";
import { useEnqueuePropertySync, usePropertySyncStatus } from "@/hooks/usePropertySync";
import type { PublicationStatusView } from "@/lib/imoveis/publish.functions";

const PROVIDERS = [
  { key: "cordial", label: "Cordial" },
  { key: "morar", label: "Morar" },
] as const;

const BLOCKING_ERRORS = new Set(["config", "validation", "business", "mapping", "auth"]);
const fmt = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR") : null;

function destinationState(row: PublicationStatusView | undefined, label: string) {
  if (!row) return { text: "Salvo no Gestão", tone: "text-foreground/65 bg-foreground/8" };
  if (row.status === "unpublished" && !row.activeJob) {
    return { text: `Oculto na ${label}`, tone: "text-foreground/65 bg-foreground/8" };
  }
  if (
    (row.remote.matchCount ?? 0) > 1 ||
    row.cadastro.conflictCount > 0 ||
    row.media.status === "blocked_image" ||
    BLOCKING_ERRORS.has(row.lastErrorCategory ?? "")
  ) {
    return { text: `Impedimento na ${label}`, tone: "text-destructive bg-destructive/10" };
  }
  const cadastroConfirmed = row.cadastro.localRevision != null &&
    row.cadastro.confirmedRevision != null &&
    row.cadastro.confirmedRevision >= row.cadastro.localRevision &&
    row.cadastro.divergent.length === 0 && row.cadastro.unverifiable.length === 0;
  const mediaConfirmed = row.media.status === "synced" &&
    row.media.confirmedRevision != null && row.media.desiredRevision != null &&
    row.media.confirmedRevision >= row.media.desiredRevision;
  if (row.status === "published" && cadastroConfirmed && mediaConfirmed && !row.activeJob) {
    return { text: "Atualizado", tone: "text-emerald-700 bg-emerald-500/12" };
  }
  return { text: `Atualizando ${label}`, tone: "text-sky-700 bg-sky-500/12" };
}

function destinationDetails(row: PublicationStatusView) {
  const details = [
    row.cadastro.savedAt ? `Salvo no Gestão: ${fmt(row.cadastro.savedAt)}` : null,
    row.lastVerifiedAt ? `Última confirmação cadastral: ${fmt(row.lastVerifiedAt)}` : null,
    row.media.lastVerifiedAt ? `Última conferência das fotos: ${fmt(row.media.lastVerifiedAt)}` : null,
    row.activeJob?.nextRunAt ? `Próxima execução: ${fmt(row.activeJob.nextRunAt)}` : null,
    row.cadastro.divergent.length ? `Campos não confirmados: ${row.cadastro.divergent.join(", ")}` : null,
    row.cadastro.unverifiable.length ? `Campos sem confirmação: ${row.cadastro.unverifiable.join(", ")}` : null,
    row.lastErrorMessage || null,
  ];
  if ((row.remote.matchCount ?? 0) > 1) {
    details.push(`Há ${row.remote.matchCount} anúncios com a mesma referência nesta conta. A escolha do anúncio exige decisão administrativa.`);
  }
  if (row.media.status === "delivery_unknown") {
    details.push("O envio de uma foto ainda não foi confirmado pelo site. A conferência automática evita uma cópia duplicada.");
  }
  if (row.media.status === "blocked_image") {
    details.push("Uma foto ativa não pôde ser preparada. Confira a mensagem dessa foto na galeria e corrija o arquivo; a atualização volta automaticamente.");
  }
  if (row.media.orderGuarantee === "remote_content_drift") {
    details.push("O conteúdo das fotos difere da galeria salva no Gestão; a correção será planejada com os arquivos locais.");
  }
  return details.filter((detail): detail is string => Boolean(detail));
}

export function PropertyPublishPanel({
  propertyId,
  canPublish,
}: {
  propertyId: string;
  canPublish: boolean;
  isAdmin: boolean;
}) {
  const status = usePropertySyncStatus(propertyId);
  const enqueue = useEnqueuePropertySync(propertyId);
  const [selected, setSelected] = useState<string[]>([]);
  const byProvider = useMemo(
    () => new Map((status.data ?? []).map((row) => [row.provider, row])),
    [status.data],
  );

  async function run(action: "publish" | "unpublish", providers: string[]) {
    if (!providers.length) {
      toast.error("Selecione ao menos um destino.");
      return;
    }
    try {
      await enqueue.mutateAsync({ propertyId, providers, action });
      toast.success(action === "publish"
        ? "Decisão de publicação salva no Gestão. Os destinos serão atualizados automaticamente."
        : "Decisão de ocultar salva no Gestão. Os destinos serão atualizados automaticamente.");
      setSelected([]);
    } catch (error) {
      toast.error((error as Error)?.message ?? "Não foi possível salvar a decisão de publicação.");
    }
  }

  return (
    <section className="glass-panel rounded-3xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <CloudUpload className="size-4 text-primary" /> Publicação nos sites
        </h2>
        {status.isFetching && <Loader2 className="size-3.5 animate-spin text-foreground/35" />}
      </div>

      <div className="mt-3 space-y-2">
        {PROVIDERS.map((provider) => {
          const row = byProvider.get(provider.key);
          const state = destinationState(row, provider.label);
          return (
            <div key={provider.key} className="rounded-2xl bg-white/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                {canPublish && (
                  <input
                    type="checkbox"
                    checked={selected.includes(provider.key)}
                    onChange={() => setSelected((current) => current.includes(provider.key)
                      ? current.filter((item) => item !== provider.key)
                      : [...current, provider.key])}
                    className="size-4 accent-[hsl(var(--primary))]"
                    aria-label={`Selecionar ${provider.label}`}
                  />
                )}
                <span className="text-sm font-semibold">{provider.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${state.tone}`}>
                  {state.text}
                </span>
                {row?.externalPropertyId && (
                  <span className="font-mono text-[10px] text-foreground/45">#{row.externalPropertyId}</span>
                )}
                {row?.externalPublicUrl && row.enabled && row.status === "published" && (
                  <a href={row.externalPublicUrl} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                    Ver anúncio <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
              {row && (
                <details className="mt-2 text-[11px] text-foreground/65">
                  <summary className="cursor-pointer font-semibold">Detalhes da atualização</summary>
                  <div className="mt-2 space-y-1">
                    {destinationDetails(row).map((detail, index) => <p key={index}>{detail}</p>)}
                    {!destinationDetails(row).length && <p>Aguardando a primeira confirmação deste destino.</p>}
                  </div>
                </details>
              )}
              {canPublish && row?.status === "published" && (
                <button type="button" onClick={() => void run("unpublish", [provider.key])}
                  className="mt-2 rounded-full bg-foreground/8 px-3 py-1.5 text-[11px] font-semibold">
                  Ocultar do site
                </button>
              )}
            </div>
          );
        })}
      </div>

      {canPublish && (
        <button type="button" onClick={() => void run("publish", selected)}
          disabled={enqueue.isPending || selected.length === 0}
          className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 disabled:opacity-40">
          {enqueue.isPending ? "Salvando decisão…" : "Publicar / atualizar selecionados"}
        </button>
      )}
    </section>
  );
}
