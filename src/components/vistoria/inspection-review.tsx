import { Input } from "@/components/ui/input";
import { useDrafts } from "@/lib/vistoria/drafts";
import { type PendingEntry } from "@/lib/vistoria/local-store";
import { deliverPdf } from "@/lib/vistoria/media-client";
import {
  assessmentSummary,
  qualityAlerts,
  REVIEW_GROUPS,
  reviewIssues,
  STATUS_LABEL,
  type InspectionStatus,
} from "@/lib/vistoria/model";
import { toPdfModel } from "@/lib/vistoria/pdf-model";
import { useLocalQueue, useSaver } from "@/lib/vistoria/use-inspection";
import {
  finalizeInspection,
  reopenInspection,
  signInspectionDocument,
  signInspectionFiles,
  updateInspectionBasics,
  type InspectionFull,
} from "@/lib/vistoria/vistoria.functions";
import { useServerFn } from "@tanstack/react-start";
import { Check, Download, FileText, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { fmtInspectionTime as fmt } from "@/lib/vistoria/ui";
type Saver = ReturnType<typeof useSaver>;
type Queue = ReturnType<typeof useLocalQueue>;
export function ReviewTab({
  data,
  pending,
  saver,
  onJump,
  refetch,
  queueBlocked,
}: {
  data: InspectionFull;
  pending: PendingEntry[];
  queueBlocked: boolean;
  saver: Saver;
  onJump: (roomId?: string, itemId?: string, kind?: string) => void;
  refetch: () => void;
}) {
  const i = data.inspection;
  const drafts = useDrafts();
  const [reviewed, setReviewed] = useState(false);
  const summary = assessmentSummary(data.items),
    alerts = qualityAlerts(data);
  useEffect(() => setReviewed(false), [i.revision, drafts.pending.length, pending.length]);
  const sign = useServerFn(signInspectionFiles);
  const finalize = useServerFn(finalizeInspection);
  const reopen = useServerFn(reopenInspection);
  const signDoc = useServerFn(signInspectionDocument);
  const upd = useServerFn(updateInspectionBasics);
  const [busy, setBusy] = useState<null | "draft" | "final">(null);
  const [photoErrors, setPhotoErrors] = useState<string[]>([]);
  const [reopenReason, setReopenReason] = useState("");
  const issues = useMemo(
    () =>
      reviewIssues({
        basics: {
          inspected_at: i.inspected_at,
          responsible_id: i.responsible_id,
          plan_confirmed: i.plan_confirmed,
        },
        rooms: data.rooms,
        items: data.items,
        media: data.media,
        notes: data.notes,
        localPending: pending.map((p) => ({ room_id: p.roomId, kind: p.kind, status: p.status })),
      }),
    [data, i, pending],
  );

  async function build(draft: boolean) {
    const [{ buildInspectionPdf, PdfPhotoError }] = await Promise.all([
      import("@/lib/vistoria/pdf"),
    ]);
    const model = toPdfModel(data, { draft, version: draft ? null : i.current_version + 1 });
    const paths = model.rooms.flatMap((r) => r.photos.map((p) => p.path));
    const urls = paths.length ? await sign({ data: { inspectionId: i.id, paths } }) : {};
    const loader = async (path: string) => {
      const u = urls[path];
      if (!u) throw new Error("sem link de acesso");
      let last: unknown;
      for (let a = 0; a < 3; a++) {
        try {
          const r = await fetch(u);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const bytes = new Uint8Array(await r.arrayBuffer());
          return { bytes, mime: bytes[0] === 0x89 ? "image/png" : "image/jpeg" };
        } catch (e) {
          last = e;
          await new Promise((res) => setTimeout(res, 400 * (a + 1)));
        }
      }
      throw last instanceof Error ? last : new Error("falha no download");
    };
    try {
      return { bytes: await buildInspectionPdf(model, loader), model };
    } catch (e) {
      if (e instanceof PdfPhotoError)
        setPhotoErrors(e.failed.map((f) => `Foto ${f.number} (${f.room}): ${f.reason}`));
      throw e;
    }
  }

  async function downloadDraft() {
    setBusy("draft");
    setPhotoErrors([]);
    try {
      const { bytes } = await build(true);
      await deliverPdf(bytes, `vistoria-${i.numero}-rascunho.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar o PDF");
    } finally {
      setBusy(null);
    }
  }

  async function conclude() {
    setBusy("final");
    setPhotoErrors([]);
    try {
      await drafts.controller.flush();
      if (Object.keys(drafts.controller.snapshot()).length || pending.length || queueBlocked)
        throw new Error("Sincronize as alterações deste aparelho antes de emitir.");
      const result = await saver.run(() =>
        finalize({ data: { id: i.id, expectedRevision: i.revision, reviewed: true } }),
      );
      if (!result) throw new Error("A emissão não foi confirmada. Atualize a vistoria.");
      toast.success(`Laudo v${result.version} emitido.`);
      refetch();
      await downloadVersion(result.version);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir");
    } finally {
      setBusy(null);
    }
  }

  async function downloadVersion(v: number) {
    try {
      const { url } = await signDoc({ data: { inspectionId: i.id, version: v } });
      const r = await fetch(url);
      if (!r.ok) throw new Error("Falha ao baixar");
      await deliverPdf(new Uint8Array(await r.arrayBuffer()), `vistoria-${i.numero}-v${v}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao baixar");
    }
  }

  const concluded = i.status === "concluida";
  return (
    <div className="space-y-4">
      {!concluded && (
        <section className="premium-card rounded-2xl p-4">
          <h2 className="text-sm font-semibold">
            {issues.length
              ? `${issues.length} pendência(s) antes de concluir`
              : "Tudo pronto para concluir"}
          </h2>
          <p className="mt-2 text-sm text-foreground/60">
            {summary.filled}/{summary.total} preenchidos · {summary.evaluated} avaliados ·{" "}
            {summary.untested} não testados · {summary.notApplicable} não aplicáveis
          </p>
          <div className="mt-3 divide-y">
            {REVIEW_GROUPS.map((group) => {
              const own = issues.filter((iss) =>
                (group.kinds as readonly string[]).includes(iss.kind),
              );
              const local = group.id === "envios" ? drafts.pending : [];
              return (
                <details key={group.id} className="py-1">
                  <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
                    {group.label}{" "}
                    <span className="text-foreground/60">({own.length + local.length})</span>
                  </summary>
                  <ul className="space-y-1">
                    {own.map((iss, k) => (
                      <li key={k}>
                        <button
                          type="button"
                          onClick={() => onJump(iss.roomId, iss.itemId, iss.kind)}
                          className="min-h-11 w-full rounded-xl px-2 py-2 text-left text-sm text-primary hover:bg-primary/5"
                        >
                          {iss.message} <span className="underline">Resolver</span>
                        </button>
                      </li>
                    ))}
                    {local.map((v) => (
                      <li key={v.entry.key} className="py-2 text-sm">
                        <button
                          type="button"
                          className="min-h-11 text-left text-primary"
                          onClick={() =>
                            onJump(
                              v.entry.roomId ?? undefined,
                              v.entry.entity === "item"
                                ? v.entry.entityId
                                : v.entry.entity === "narrative" &&
                                    v.entry.entityId !== "narrative:general"
                                  ? v.entry.entityId.replace(/^narrative:/, "")
                                  : v.entry.entity === "note"
                                    ? (data.notes.find((n) => n.id === v.entry.entityId)?.item_id ??
                                      undefined)
                                    : undefined,
                              v.entry.entity === "narrative" || v.entry.entity === "note"
                                ? "relato_pendente"
                                : "envio_local",
                            )
                          }
                        >
                          {v.entry.entity === "new-item"
                            ? "Novo item"
                            : v.entry.entity === "narrative"
                              ? "Relato digitado"
                              : v.entry.entity === "inspection"
                                ? "Dados gerais"
                                : "Texto ou avaliação"}{" "}
                          ·{" "}
                          {v.status === "conflict"
                            ? "Conflito a resolver"
                            : v.status === "error"
                              ? "Falha ao salvar"
                              : "No aparelho"}{" "}
                          · Abrir
                        </button>
                        {v.error && <p className="text-destructive">{v.error}</p>}
                        <details>
                          <summary className="min-h-11 cursor-pointer py-3 text-sm">
                            Ver rascunho preservado
                          </summary>
                          <p className="whitespace-pre-wrap break-words text-sm">
                            {Object.entries(v.entry.patch)
                              .filter(([k]) => k !== "clientKey")
                              .map(
                                ([k, value]) =>
                                  `${draftFieldLabel(k)}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
                              )
                              .join("\n")}
                          </p>
                          <button
                            type="button"
                            className="min-h-11 text-sm text-destructive"
                            onClick={() => {
                              if (
                                confirm(
                                  "Descartar este rascunho local? O texto pendente será removido deste aparelho.",
                                )
                              )
                                void drafts.controller.discard(v.entry.key);
                            }}
                          >
                            Descartar este rascunho
                          </button>
                        </details>
                        {v.status === "conflict" && (
                          <DraftConflict entryKey={v.entry.key} data={data} onJump={onJump} />
                        )}
                      </li>
                    ))}
                  </ul>
                  {!own.length && !local.length && (
                    <p className="pb-2 text-sm text-foreground/60">Sem pendências neste grupo.</p>
                  )}
                </details>
              );
            })}
          </div>
          <details className="mt-3 rounded-xl border border-amber-600/40 p-3">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">
              Alertas de qualidade ({alerts.length})
            </summary>
            <p className="mb-2 text-sm text-foreground/60">
              Confirme estes registros. A avaliação de cada item continua sob sua decisão.
            </p>
            <ul>
              {alerts.map((alert) => (
                <li key={alert.key}>
                  <button
                    type="button"
                    className="min-h-11 py-2 text-left text-sm text-primary"
                    onClick={() => onJump(alert.roomId, alert.itemId, "item_pendente")}
                  >
                    {alert.message}
                  </button>
                </li>
              ))}
            </ul>
          </details>
          <label className="mt-4 flex min-h-11 items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
              className="mt-1 size-5 shrink-0 accent-primary"
            />
            Revisei os dados, a aplicabilidade dos itens e os alertas de qualidade. Confirmo o que
            foi observado.
          </label>

          {i.status !== "em_revisao" && (
            <button
              type="button"
              className="mt-2 min-h-11 text-sm font-semibold text-primary"
              onClick={() =>
                void saver.run(
                  () =>
                    upd({
                      data: {
                        id: i.id,
                        expectedRevision: i.revision,
                        patch: { status: "em_revisao" },
                      },
                    }),
                  (f, row) => ({ ...f, inspection: row }),
                )
              }
            >
              Marcar como em revisão
            </button>
          )}
        </section>
      )}
      {photoErrors.length > 0 && (
        <section
          className="rounded-2xl border border-destructive/40 bg-destructive/5 p-3 text-sm"
          role="alert"
        >
          <p className="font-semibold text-destructive">
            Fotos que não carregaram — o laudo final não foi emitido:
          </p>
          <ul className="mt-1 list-disc pl-5">
            {photoErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs">Verifique a conexão e tente novamente.</p>
        </section>
      )}
      <section className="grid gap-2">
        {concluded && (
          <button
            type="button"
            className="min-h-12 rounded-xl bg-primary px-3 font-semibold text-primary-foreground"
            onClick={() => void downloadVersion(i.current_version)}
          >
            Baixar laudo v{i.current_version}
          </button>
        )}
        {!concluded && (issues.length > 0 || drafts.pending.length > 0 || !reviewed) && (
          <p className="text-sm text-foreground/60">
            A emissão exige dados essenciais completos, textos e arquivos sincronizados e sua
            confirmação da revisão acima.
          </p>
        )}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void downloadDraft()}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-input text-sm font-semibold disabled:opacity-50"
        >
          {busy === "draft" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FileText className="size-4" />
          )}{" "}
          Baixar prévia não emitida
        </button>
        {!concluded && (
          <button
            type="button"
            disabled={
              busy !== null ||
              issues.length > 0 ||
              drafts.pending.length > 0 ||
              queueBlocked ||
              !reviewed
            }
            onClick={() => void conclude()}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 disabled:opacity-45"
          >
            {busy === "final" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}{" "}
            Concluir e emitir laudo v{i.current_version + 1}
          </button>
        )}
      </section>
      {data.documents.length > 0 && (
        <section className="premium-card rounded-2xl p-4">
          <h2 className="mb-2 text-sm font-semibold">Laudos emitidos</h2>
          <ul className="space-y-1">
            {data.documents.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => void downloadVersion(d.version)}
                  className="flex min-h-11 w-full items-center justify-between rounded-xl px-2 text-sm hover:bg-foreground/5"
                >
                  <span>
                    Versão {d.version} · {fmt(d.created_at)}
                  </span>
                  <Download className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {concluded && (
        <section className="premium-card space-y-2 rounded-2xl p-4">
          <h2 className="text-sm font-semibold">Precisa alterar?</h2>
          <p className="text-xs text-foreground/60">
            Reabrir coloca a vistoria em revisão. O laudo já emitido continua guardado; a conclusão
            gera uma nova versão.
          </p>
          <Input
            aria-label="Motivo da reabertura"
            placeholder="Motivo"
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            className="h-11"
          />
          <button
            type="button"
            disabled={reopenReason.trim().length < 3}
            onClick={() =>
              void saver
                .run(() =>
                  reopen({
                    data: { id: i.id, expectedRevision: i.revision, reason: reopenReason.trim() },
                  }),
                )
                .then(() => {
                  setReopenReason("");
                  refetch();
                })
            }
            className="min-h-11 w-full rounded-xl border border-input text-sm font-semibold disabled:opacity-40"
          >
            Reabrir para revisão
          </button>
        </section>
      )}
      <section className="premium-card rounded-2xl p-4">
        <h2 className="mb-2 text-sm font-semibold">Histórico</h2>
        <ul className="space-y-1 text-xs text-foreground/70">
          {data.events.map((e) => (
            <li key={e.id}>
              {fmt(e.created_at)} · {eventLabel(e)}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function eventLabel(e: InspectionFull["events"][number]) {
  const d = e.details ?? {};
  switch (e.event) {
    case "criada":
      return `Vistoria criada (${d.rooms ?? 0} ambientes)`;
    case "status":
      return `Status: ${STATUS_LABEL[d.status as InspectionStatus] ?? d.status}`;
    case "concluida":
      return `Concluída · laudo v${d.version}`;
    case "reaberta":
      return `Reaberta: ${d.motivo ?? ""}`;
    case "ambiente_adicionado":
      return `Ambiente adicionado: ${d.name ?? ""}`;
    case "ambiente_removido":
      return "Ambiente removido";
    case "foto_excluida":
      return "Foto excluída";
    default:
      return e.event;
  }
}

function DraftConflict({
  entryKey,
  data,
  onJump,
}: {
  entryKey: string;
  data: InspectionFull;
  onJump: (roomId?: string, itemId?: string, kind?: string) => void;
}) {
  const { views, controller } = useDrafts();
  const view = views[entryKey];
  if (!view) return null;
  const entry = view.entry;
  const localEditor = entry.entity === "narrative" || entry.entity === "new-item";
  const remote =
    entry.entity === "inspection"
      ? data.inspection
      : entry.entity === "item"
        ? data.items.find((r) => r.id === entry.entityId)
        : entry.entity === "room"
          ? data.rooms.find((r) => r.id === entry.entityId)
          : entry.entity === "note"
            ? data.notes.find((r) => r.id === entry.entityId)
            : data.media.find((r) => r.id === entry.entityId);
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="font-semibold">Escolha a versão a manter</p>
      <dl className="space-y-3">
        {Object.entries(entry.patch)
          .filter(([field]) => field !== "clientKey")
          .map(([field, value]) => (
            <div key={field}>
              <dt className="font-semibold">{draftFieldLabel(field)}</dt>
              <dd className="whitespace-pre-wrap break-words">Seu rascunho: {draftValue(value)}</dd>
              <dd className="whitespace-pre-wrap break-words text-foreground/60">
                Servidor: {draftValue((remote as unknown as Record<string, unknown>)?.[field])}
              </dd>
            </div>
          ))}
      </dl>
      <button
        type="button"
        disabled={!remote && !localEditor}
        className="min-h-11 w-full border px-2 text-sm"
        onClick={() => {
          if (localEditor)
            void controller
              .restoreEditor(entryKey)
              .then(() =>
                onJump(
                  entry.roomId ?? undefined,
                  entry.entityId === "narrative:general" || entry.entity === "new-item"
                    ? undefined
                    : entry.entityId.replace(/^narrative:/, ""),
                  entry.entity === "narrative" ? "relato_pendente" : "envio_local",
                ),
              )
              .catch((e) => toast.error(String(e)));
          else if (remote)
            void controller.resolve(entryKey, remote as unknown as Record<string, unknown>);
        }}
      >
        {localEditor ? "Retomar este texto no editor" : "Manter meu texto e enviar"}
      </button>
      <button
        type="button"
        className="min-h-11 w-full text-sm text-destructive"
        onClick={() => void controller.discard(entryKey)}
      >
        Usar servidor e descartar meu rascunho
      </button>
    </div>
  );
}

function draftFieldLabel(field: string) {
  return (
    (
      {
        material: "Material",
        color: "Cor",
        damage: "Avaria",
        notes: "Observação",
        text: "Relato",
        approved_text: "Texto aprovado",
        state: "Avaliação",
        untested_reason: "Motivo de não testar",
        quantity: "Quantidade",
        name: "Nome",
        general_notes: "Observações gerais",
        conclusion: "Conclusão",
        status: "Situação",
        caption: "Legenda",
      } as Record<string, string>
    )[field] ?? "Dados do formulário"
  );
}

function draftValue(value: unknown): string {
  if (value == null || value === "") return "Não informado";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) return value.map(draftValue).join("; ");
  if (typeof value === "object")
    return Object.entries(value)
      .map(([k, v]) => `${draftFieldLabel(k)}: ${draftValue(v)}`)
      .join("; ");
  const labels: Record<string, string> = {
    bom: "Bom",
    regular: "Regular",
    ruim: "Ruim",
    nao_testado: "Não testado",
    nao_se_aplica: "Não se aplica",
    pendente: "Pendente",
    revisado: "Revisado",
    descartado: "Descartado",
    rascunho: "Rascunho",
    em_andamento: "Em andamento",
    em_revisao: "Em revisão",
    concluida: "Concluída",
  };
  return labels[String(value)] ?? String(value);
}
