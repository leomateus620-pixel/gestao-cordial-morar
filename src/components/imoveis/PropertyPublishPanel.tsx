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

/**
 * Aviso sobre as FOTOS, com estados distintos para cada etapa: salvo aqui,
 * esperando a marca d'água, esperando envio, exclusão pendente, substituição em
 * andamento, ordem sendo refeita, entrega sem confirmação e confirmado no site.
 *
 * Desde 22/09/2026 o site aceita excluir foto por código, então ordem e capa são
 * refeitas automaticamente (apagando e reinserindo a partir dos arquivos
 * guardados aqui). Só o que realmente não é possível aparece como limitação.
 */
function mediaNote(media: {
  status: string | null;
  orderGuarantee: string | null;
  expectedCount: number | null;
  syncedCount: number | null;
  remoteCount: number | null;
}): string | null {
  const counts =
    media.expectedCount != null
      ? ` (${media.syncedCount ?? 0} de ${media.expectedCount} fotos enviadas${
          media.remoteCount != null ? `, ${media.remoteCount} no site` : ""
        })`
      : "";

  switch (media.status) {
    case "waiting_watermark":
      return `Fotos salvas aqui · esperando a marca d'água antes do envio${counts}`;
    case "pending_delete":
      return `Exclusão de foto pendente no site · a foto é mantida aqui até a remoção ser confirmada${counts}`;
    case "rebuilding":
      return `Refazendo a ordem das fotos no site · as fotos são reenviadas na sequência correta${counts}`;
    case "remote_read_unreliable":
      return `Não foi possível ler a galeria do site agora · nada é enviado nem apagado sem essa conferência${counts}`;
    default:
      break;
  }

  switch (media.orderGuarantee) {
    case "remote_multiple_covers":
      return `O site tem mais de uma foto em destaque · a correção é feita na próxima organização das fotos${counts}`;
    case "remote_content_drift":
      return `Foto editada aqui · para trocar a imagem no site use "substituir foto"${counts}`;
    case "delivery_unknown":
      return `Envio de foto sem confirmação do site · nada será reenviado antes de conferir a galeria${counts}`;
    case "exclusao_pendente":
      return `Exclusão de foto ainda não confirmada pelo site · será repetida automaticamente${counts}`;
    case "exclusao_nao_confirmada":
      return `O site não confirmou a remoção de uma foto · nova tentativa em andamento${counts}`;
    case "ordem_em_reconstrucao":
    case "reinsercao_interrompida":
      return `Ordem das fotos sendo refeita no site · continua de onde parou${counts}`;
    case "fotos_antigas_sobrando":
      return `Há fotos antigas no site além das atuais · elas ficam listadas para você decidir${counts}`;
    case "formato_desconhecido":
    case "paginacao_incompleta":
    case "falha_consulta":
    case "leitura_inconclusiva":
      return `A galeria do site não pôde ser conferida agora · nada é apagado nesse caso${counts}`;
    case "pending":
      return `Envio de fotos em andamento${counts}`;
    case "insercao_sem_verificacao":
      return `Fotos enviadas · não foi possível conferir a galeria do site agora${counts}`;
    case "ordem_confirmada_por_leitura":
    case "insercao_verificada_por_quantidade":
      return `Fotos e ordem confirmadas no site${counts}`;
    default:
      return null;
  }
}


type Row = import("@/lib/imoveis/publish.functions").PublicationStatusView;
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : null);

/** Cadastro, características e fotos com estados separados por destino. */
function componentStates(row: Row, running: boolean) {
  const ok = "text-emerald-700";
  const warn = "text-amber-700";
  const bad = "text-destructive";
  const c = row.cadastro;
  let cad: [string, string];
  if (running) cad = ["Em processamento", warn];
  else if (row.status === "error") cad = ["Com erro", bad];
  else if (c.conflictCount > 0) cad = [`Divergente (${c.conflictCount})`, bad];
  else if (c.divergent.length) cad = ["Parcial", warn];
  else if (c.unverifiable.length) cad = ["Não verificável", warn];
  else if (c.confirmedRevision != null && c.localRevision != null && c.confirmedRevision >= c.localRevision)
    cad = ["Confirmado", ok];
  else if (!row.externalPropertyId) cad = ["Pendente", warn];
  else cad = ["Pendente", warn];
  const cadDetail = [
    c.savedAt ? `Salvo aqui: ${fmt(c.savedAt)}` : null,
    row.lastVerifiedAt ? `Confirmado no site: ${fmt(row.lastVerifiedAt)}` : null,
    c.divergent.length ? `Não confirmados: ${c.divergent.join(", ")}` : null,
    c.unverifiable.length ? `Sem como conferir: ${c.unverifiable.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const ch = row.characteristics;
  const chState: [string, string] = running
    ? ["Em processamento", warn]
    : ch.incomplete
      ? ["Parcial", warn]
      : ch.syncedAt
        ? ["Confirmado", ok]
        : ["Pendente", warn];

  const m = row.media;
  const mState: [string, string] =
    m.status === "failed" || m.status === "error" || (m.failedCount ?? 0) > 0
      ? ["Com erro", bad]
      : m.status === "synced" || m.orderGuarantee === "ordem_confirmada_por_leitura"
        ? ["Confirmado", ok]
        : m.status === "delivery_unknown" || m.status === "remote_read_unreliable" || m.orderGuarantee === "delivery_unknown" || m.orderGuarantee === "insercao_sem_verificacao"
          ? ["Não verificável", warn]
          : m.status
            ? ["Em processamento", warn]
            : ["Pendente", warn];

  return [
    { label: "Cadastro", state: cad[0], tone: cad[1], detail: cadDetail },
    {
      label: "Características",
      state: chState[0],
      tone: chState[1],
      detail: ch.syncedAt ? `${ch.count} no site · ${fmt(ch.syncedAt)}` : "",
    },
    {
      label: "Fotos",
      state: mState[0],
      tone: mState[1],
      detail: m.lastVerifiedAt ? `Conferidas: ${fmt(m.lastVerifiedAt)}` : "",
    },
  ];
}

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
          // Quatro estados separados, sem misturar: o que está salvo aqui,
          // o que espera envio, o que está bloqueado e o que a imobiliária
          // já confirmou no site.
          const waiting = !!job || row?.status === "pending" || row?.status === "syncing";
          const blocked =
            job?.errorCategory === "config" ||
            row?.lastErrorCategory === "config" ||
            (row?.remote.matchCount ?? 0) > 1;
          const confirmed = !!row?.externalPropertyId && !!row?.lastVerifiedAt;
          const stateChips: Array<{ label: string; on: boolean; className: string }> = [
            {
              label: "Salvo no Gestão",
              on: true,
              className: "bg-emerald-500/12 text-emerald-700",
            },
            {
              label: "Aguardando sincronização",
              on: waiting,
              className: "bg-amber-500/12 text-amber-700",
            },
            { label: "Bloqueado", on: blocked, className: "bg-destructive/12 text-destructive" },
            {
              label: "Confirmado na imobiliária",
              on: confirmed,
              className: "bg-sky-500/12 text-sky-700",
            },
          ];
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

              <div className="mt-2 flex flex-wrap gap-1.5">
                {stateChips.map((chip) => (
                  <span
                    key={chip.label}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      chip.on ? chip.className : "bg-foreground/6 text-foreground/35"
                    }`}
                  >
                    {chip.on ? "● " : "○ "}
                    {chip.label}
                  </span>
                ))}
              </div>



              {row && (
                <div className="mt-2 grid gap-1 text-[11px] sm:grid-cols-3">
                  {componentStates(row, !!job).map((c) => (
                    <div key={c.label} className="rounded-xl bg-foreground/4 px-2 py-1.5">
                      <div className="font-semibold text-foreground/70">{c.label}</div>
                      <div className={c.tone}>{c.state}</div>
                      {c.detail && <div className="text-[10px] text-foreground/45">{c.detail}</div>}
                    </div>
                  ))}
                </div>
              )}

              {row?.lastErrorMessage && (
                <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-destructive/8 p-2 text-[11px] text-destructive">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  {/1500 caracteres/i.test(row.lastErrorMessage)
                    ? "A descrição passava do limite do site (1500 caracteres). Agora ela é encurtada automaticamente no fim — clique em Reprocessar para publicar."
                    : row.lastErrorMessage}
                </p>
              )}

              {row?.media && mediaNote(row.media) && (
                <p className="mt-2 text-[11px] text-foreground/55">{mediaNote(row.media)}</p>
              )}

              {/* Duplicidade no site: o sistema bloqueia novo cadastro e nunca
                  exclui anúncio sozinho — a escolha do que fica é de uma pessoa. */}
              {(row?.remote.matchCount ?? 0) > 1 && (
                <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-destructive/8 p-2 text-[11px] text-destructive">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  O site tem {row?.remote.matchCount} anúncios com a referência{" "}
                  {row?.externalReference} ({row?.remote.matchIds.join(", ")}). Nenhum novo cadastro
                  será criado até que um deles seja removido manualmente no painel do site.
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
                          .mutateAsync({ propertyId, provider: provider.key, component: "cadastro" })
                          .then(() => toast.success("Reprocessamento solicitado."))
                          .catch((error: Error) => toast.error(error.message))
                      }
                      className="inline-flex items-center gap-1.5 rounded-full bg-foreground/8 px-3 py-1.5 text-[11px] font-semibold"
                    >
                      <RotateCcw className="size-3" /> Tentar cadastro de novo
                    </button>
                  )}
                  {row.media.status === "error" || (row.media.failedCount ?? 0) > 0 ? (
                    <button
                      onClick={() =>
                        retry
                          .mutateAsync({ propertyId, provider: provider.key, component: "fotos" })
                          .then(() => toast.success("Envio das fotos retomado."))
                          .catch((error: Error) => toast.error(error.message))
                      }
                      className="inline-flex items-center gap-1.5 rounded-full bg-foreground/8 px-3 py-1.5 text-[11px] font-semibold"
                    >
                      <RotateCcw className="size-3" /> Tentar fotos de novo
                    </button>
                  ) : null}
                  {row.status === "published" && (
                    <button
                      onClick={() => run("unpublish", [provider.key])}
                      className="rounded-full bg-foreground/8 px-3 py-1.5 text-[11px] font-semibold"
                    >
                      Ocultar do site
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
