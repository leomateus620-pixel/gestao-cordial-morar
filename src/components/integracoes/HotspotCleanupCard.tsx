import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  dryRunHotspotAlterarAudit,
  listHotspotCleanup,
  recheckHotspotCleanup,
  setHotspotCleanupState,
  type HotspotCleanupRow,
} from "@/lib/imobibrasil/hotspot-cleanup.functions";

const STATE_LABEL: Record<string, string> = {
  pendente: "Pendente",
  limpo_manual: "Limpo manualmente",
  reconferido: "Reconferido",
};

const CLASSIFICATION_LABEL: Record<string, string> = {
  somente_interno: "Somente conteúdo interno",
  misto: "Legítimo + interno misturado",
  incerto: "Incerto — conferir à mão",
};

const PROVIDER_LABEL: Record<string, string> = { cordial: "Cordial", morar: "Morar" };

type DryRun = Awaited<ReturnType<typeof dryRunHotspotAlterarAudit>>;

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition duration-200 " +
        (active
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
          : "glass-panel text-foreground/65")
      }
    >
      {children}
    </button>
  );
}

export function HotspotCleanupCard({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const list = useServerFn(listHotspotCleanup);
  const mark = useServerFn(setHotspotCleanupState);
  const recheck = useServerFn(recheckHotspotCleanup);
  const dryRun = useServerFn(dryRunHotspotAlterarAudit);

  const [provider, setProvider] = useState<string | null>(null);
  const [state, setState] = useState<string | null>("pendente");
  const [onlyPublished, setOnlyPublished] = useState(true);
  const [search, setSearch] = useState("");
  const [report, setReport] = useState<DryRun | null>(null);

  const query = useQuery({
    queryKey: ["hotspot-cleanup", provider, state, onlyPublished, search],
    queryFn: () =>
      list({
        data: {
          provider,
          state,
          publicationStatus: onlyPublished ? "published" : null,
          search: search.trim() || null,
        },
      }),
    enabled,
    staleTime: 30_000,
  });

  const markMutation = useMutation({
    mutationFn: (input: { id: string; state: "pendente" | "limpo_manual" }) => mark({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotspot-cleanup"] }),
  });

  const recheckMutation = useMutation({
    mutationFn: (ids: string[]) => recheck({ data: { ids } }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["hotspot-cleanup"] });
      const ok = result.checked.filter((item) => item.ok).length;
      const failed = result.checked.filter((item) => !item.ok);
      toast.success(`${ok} anúncio(s) reconferido(s) com sucesso.`);
      for (const item of failed.slice(0, 3)) {
        toast.error(`Ainda pendente: ${item.reasons.join(" · ")}`);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const dryRunMutation = useMutation({
    mutationFn: (id: string) => dryRun({ data: { id } }),
    onSuccess: (result) => setReport(result),
    onError: (error: Error) => toast.error(error.message),
  });

  const summary = query.data?.summary;
  const rows: HotspotCleanupRow[] = (query.data?.rows ?? []) as HotspotCleanupRow[];
  const pendingIds = useMemo(
    () => rows.filter((row) => row.state === "limpo_manual").map((row) => row.id),
    [rows],
  );

  if (!enabled) return null;

  return (
    <section className="glass-panel mb-5 rounded-3xl p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-amber-500/15 text-amber-700">
            <Sparkles className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Limpeza de pontos fortes</p>
            <p className="text-[11px] text-foreground/55">
              Conteúdo interno antigo publicado nos sites. O Gestão só consulta — a remoção é feita
              no painel de cada site.
            </p>
          </div>
        </div>
        <button
          onClick={() => query.refetch()}
          className="glass-panel rounded-full p-2 text-foreground/60"
          title="Atualizar"
        >
          <RefreshCw className={"size-4 " + (query.isFetching ? "animate-spin" : "")} />
        </button>
      </header>

      {summary && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-foreground/70 sm:grid-cols-4">
          <span className="glass-panel rounded-2xl px-3 py-2">Total: {summary.total}</span>
          <span className="glass-panel rounded-2xl px-3 py-2">
            Cordial: {summary.byProvider["cordial"] ?? 0} · Morar: {summary.byProvider["morar"] ?? 0}
          </span>
          <span className="glass-panel rounded-2xl px-3 py-2">
            Publicados: {summary.byPublicationStatus["published"] ?? 0}
          </span>
          <span className="glass-panel rounded-2xl px-3 py-2">
            Pendentes: {summary.byState["pendente"] ?? 0} · Reconferidos:{" "}
            {summary.byState["reconferido"] ?? 0}
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Chip active={!provider} onClick={() => setProvider(null)}>
          Todos os sites
        </Chip>
        <Chip active={provider === "cordial"} onClick={() => setProvider("cordial")}>
          Cordial
        </Chip>
        <Chip active={provider === "morar"} onClick={() => setProvider("morar")}>
          Morar
        </Chip>
        <span className="mx-1 w-px bg-foreground/10" />
        {(["pendente", "limpo_manual", "reconferido"] as const).map((item) => (
          <Chip key={item} active={state === item} onClick={() => setState(item)}>
            {STATE_LABEL[item]}
          </Chip>
        ))}
        <Chip active={!state} onClick={() => setState(null)}>
          Todos os estados
        </Chip>
        <Chip active={onlyPublished} onClick={() => setOnlyPublished(!onlyPublished)}>
          Só publicados
        </Chip>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por código ou ID externo"
          className="min-w-[200px] flex-1 rounded-xl border border-foreground/[0.1] bg-white/80 px-3 py-2 text-xs outline-none focus:border-primary/40"
        />
        <button
          disabled={!pendingIds.length || recheckMutation.isPending}
          onClick={() => recheckMutation.mutate(pendingIds.slice(0, 20))}
          className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          {recheckMutation.isPending ? "Reconferindo…" : "Reconferir os limpos (até 20)"}
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {query.isLoading && (
          <p className="flex items-center gap-2 text-xs text-foreground/60">
            <Loader2 className="size-4 animate-spin" /> Carregando lista…
          </p>
        )}
        {!query.isLoading && !rows.length && (
          <p className="text-xs text-foreground/60">Nenhum anúncio neste filtro.</p>
        )}
        {rows.map((row) => (
          <Row
            key={row.id}
            row={row}
            onMark={(next) => markMutation.mutate({ id: row.id, state: next })}
            onRecheck={() => recheckMutation.mutate([row.id])}
            onDryRun={() => dryRunMutation.mutate(row.id)}
            busy={dryRunMutation.isPending || recheckMutation.isPending}
          />
        ))}
      </div>

      {report && <DryRunPanel report={report} onClose={() => setReport(null)} />}
    </section>
  );
}

function Row({
  row,
  onMark,
  onRecheck,
  onDryRun,
  busy,
}: {
  row: HotspotCleanupRow;
  onMark: (state: "pendente" | "limpo_manual") => void;
  onRecheck: () => void;
  onDryRun: () => void;
  busy: boolean;
}) {
  const check = row.checkResult as { ok?: boolean; error?: string } | null;
  return (
    <article className="rounded-2xl border border-foreground/[0.08] bg-white/60 p-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 font-semibold">
          {PROVIDER_LABEL[row.provider] ?? row.provider}
        </span>
        <span className="font-semibold">{row.codigo || "sem código"}</span>
        <span className="text-foreground/50">#{row.externalId}</span>
        <span className="text-foreground/50">{row.publicationStatus}</span>
        <span
          className={
            "rounded-full px-2 py-0.5 " +
            (row.state === "reconferido"
              ? "bg-emerald-500/15 text-emerald-700"
              : row.state === "limpo_manual"
                ? "bg-sky-500/15 text-sky-700"
                : "bg-amber-500/15 text-amber-700")
          }
        >
          {STATE_LABEL[row.state]}
        </span>
        <span className="text-foreground/50">{CLASSIFICATION_LABEL[row.classification]}</span>
        {row.publicUrl && (
          <a
            href={row.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary"
          >
            Abrir anúncio <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      <dl className="mt-2 grid gap-2 text-[11px] sm:grid-cols-3">
        <div>
          <dt className="font-semibold text-foreground/55">Hoje no site</dt>
          <dd className="whitespace-pre-line text-foreground/80">
            {row.remotePontosFortes || "—"}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground/55">Deve permanecer</dt>
          <dd className="whitespace-pre-line text-foreground/80">
            {row.expectedFinal || "(campo vazio)"}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground/55">Interno no Gestão</dt>
          <dd className="whitespace-pre-line text-foreground/60">{row.localInternalText || "—"}</dd>
        </div>
      </dl>

      {check?.ok === false && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-amber-700">
          <ShieldAlert className="size-3" />
          Última conferência não passou{check.error ? `: ${check.error}` : ""}.
        </p>
      )}
      {row.state === "reconferido" && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-emerald-700">
          <CheckCircle2 className="size-3" /> Texto interno ausente, conteúdo legítimo preservado e
          nenhum outro campo alterado.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {row.state !== "limpo_manual" && (
          <button
            onClick={() => onMark("limpo_manual")}
            className="rounded-xl border border-foreground/[0.1] px-3 py-1.5 text-[11px] font-medium"
          >
            Marcar como limpo no site
          </button>
        )}
        {row.state !== "pendente" && (
          <button
            onClick={() => onMark("pendente")}
            className="rounded-xl border border-foreground/[0.1] px-3 py-1.5 text-[11px] font-medium"
          >
            Voltar para pendente
          </button>
        )}
        <button
          disabled={busy}
          onClick={onRecheck}
          className="rounded-xl border border-foreground/[0.1] px-3 py-1.5 text-[11px] font-medium disabled:opacity-40"
        >
          Reconferir por consulta
        </button>
        <button
          disabled={busy}
          onClick={onDryRun}
          className="rounded-xl border border-foreground/[0.1] px-3 py-1.5 text-[11px] font-medium disabled:opacity-40"
        >
          Auditoria (sem envio)
        </button>
      </div>
    </article>
  );
}

function DryRunPanel({ report, onClose }: { report: DryRun; onClose: () => void }) {
  const risky = report.fields.filter(
    (field) => field.field !== "pontosFortesImovel" && field.status !== "igual",
  );
  return (
    <div className="mt-4 rounded-2xl border border-foreground/[0.08] bg-white/70 p-3 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">
          Auditoria em dry-run · {PROVIDER_LABEL[report.provider]} #{report.externalId}
        </p>
        <button onClick={onClose} className="text-foreground/50">
          fechar
        </button>
      </div>
      <p
        className={
          "mt-2 rounded-xl px-3 py-2 font-semibold " +
          (report.verdict === "seguro_somente_pontos_fortes"
            ? "bg-emerald-500/15 text-emerald-700"
            : "bg-red-500/10 text-red-700")
        }
      >
        {report.verdict === "seguro_somente_pontos_fortes"
          ? "Somente pontos fortes mudaria — ainda assim nenhum envio é feito sem sua autorização."
          : `Não executar: ${risky.length + report.reasons.length - risky.length > 0 ? report.reasons.length : 0} risco(s) em outros campos.`}
      </p>
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        <p>
          Código do proprietário: site {report.ownerLink.remote || "—"} · envio{" "}
          {report.ownerLink.payload || "vazio"} ({report.ownerLink.status})
        </p>
        <p>
          Código do corretor: site {report.brokerLink.remote || "—"} · envio{" "}
          {report.brokerLink.payload || "vazio"} ({report.brokerLink.status})
        </p>
        <p>
          Fotos no site: {report.photos.remoteCount} · o envio cadastral não toca em fotos nem na
          ordem
        </p>
      </div>
      <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-foreground/[0.06]">
        <table className="w-full">
          <thead className="bg-foreground/[0.04] text-left">
            <tr>
              <th className="px-2 py-1">Campo</th>
              <th className="px-2 py-1">Situação</th>
              <th className="px-2 py-1">Site hoje</th>
              <th className="px-2 py-1">Seria enviado</th>
            </tr>
          </thead>
          <tbody>
            {report.fields.map((field) => (
              <tr key={field.field} className="border-t border-foreground/[0.05]">
                <td className="px-2 py-1 font-medium">{field.field}</td>
                <td className="px-2 py-1">{field.status}</td>
                <td className="max-w-[220px] truncate px-2 py-1 text-foreground/60">
                  {field.remote || "—"}
                </td>
                <td className="max-w-[220px] truncate px-2 py-1 text-foreground/60">
                  {field.payload || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
