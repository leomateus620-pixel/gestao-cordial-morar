import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/auth-mock";
import { useDraftRow, useDrafts } from "@/lib/vistoria/drafts";
import { newClientKey, type PendingEntry } from "@/lib/vistoria/local-store";
import {
  observationText,
  type OrganizedObservation,
  type VoiceContext,
} from "@/lib/vistoria/model";
import type { ItemRow, NoteRow } from "@/lib/vistoria/types";
import { inspectionKey, replaceRow, useLocalQueue, useSaver } from "@/lib/vistoria/use-inspection";
import {
  createNote,
  signInspectionFiles,
  updateItem,
  updateNote,
  type InspectionFull,
} from "@/lib/vistoria/vistoria.functions";
import { deleteVoiceNote, transcribeNote } from "@/lib/vistoria/voice.functions";
import { pendingKey, removePending } from "@/lib/vistoria/local-store";
import { transcriptionLabel, transcriptionView } from "@/lib/vistoria/transcription-runner";
import type { useTranscriptionRunner } from "@/lib/vistoria/use-inspection";
type Runner = ReturnType<typeof useTranscriptionRunner>;
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Keyboard, Loader2, Mic } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { fmtInspectionTime as fmt } from "@/lib/vistoria/ui";
type Saver = ReturnType<typeof useSaver>;
type Queue = ReturnType<typeof useLocalQueue>;
export function NotesBlock(props: {
  notes: NoteRow[];
  rental?: boolean;
  items: ItemRow[];
  readOnly: boolean;
  saver: Saver;
  voiceReady: boolean;
  voiceAdmin?: boolean;
  runner?: Runner;
  onRerecord?: (note: NoteRow) => void;
  onRecord: () => void;
  onRetry: (key: string) => void;
  recording: ReactNode;
  pending: PendingEntry[];
  inspectionId: string;
  currentCtx: React.MutableRefObject<VoiceContext | null>;
  mode: "none" | "texto";
  setMode: (m: "none" | "texto") => void;
  roomId: string;
  roomName: string;
  itemId: string | null;
}) {
  const add = useServerFn(createNote);
  const { controller } = useDrafts();
  const draft = useDraftRow(
    "narrative",
    { text: "", clientKey: "" },
    `narrative:${props.itemId ?? "general"}`,
    props.roomId,
  );
  const [saving, setSaving] = useState(false);
  const context = [props.roomName, props.items.find((it) => it.id === props.itemId)?.name]
    .filter(Boolean)
    .join(" · ");
  const remoteKeys = new Set(props.notes.map((note) => note.client_key));
  const waiting = props.pending.filter(
    (entry) => entry.kind === "audio" && !remoteKeys.has(entry.clientKey),
  );
  const actionClass =
    "inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold text-primary hover:bg-primary/5";
  return (
    <section
      aria-labelledby="room-notes-title"
      className="space-y-3 rounded-xl border border-border p-3 sm:p-4"
    >
      <h3 id="room-notes-title" className="text-base font-semibold">
        Descrição e áudios
      </h3>
      {props.recording}
      {!props.readOnly && (
        <div className="flex flex-wrap gap-2">
          {!props.recording && (
            <button type="button" className={actionClass} onClick={props.onRecord}>
              <Mic className="size-4" aria-hidden /> Gravar áudio
            </button>
          )}
          {props.mode !== "texto" && (
            <button type="button" className={actionClass} onClick={() => props.setMode("texto")}>
              <Keyboard className="size-4" aria-hidden />{" "}
              {draft.value.text ? "Retomar descrição" : "Escrever descrição"}
            </button>
          )}
        </div>
      )}
      {!props.readOnly && props.mode === "texto" && (
        <div className="premium-card space-y-2 rounded-xl p-3">
          <label className="block text-sm font-medium">
            {props.rental ? "Descrição" : `Relato de ${context}`}
            <Textarea
              id="note-text"
              aria-label={props.rental ? "Descrição do cômodo" : "Relato digitado"}
              rows={5}
              disabled={saving}
              placeholder="Descreva o que observou. O texto fica neste ambiente."
              value={draft.value.text}
              onChange={(e) =>
                draft.set({
                  text: e.target.value,
                  clientKey: draft.value.clientKey || newClientKey(),
                })
              }
              className="mt-2 scroll-mt-52"
            />
          </label>
          <p className="text-xs text-foreground/60">
            Fechar ou mudar de ambiente mantém este rascunho no aparelho.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="min-h-11 flex-1 rounded-xl border text-sm"
              onClick={() => props.setMode("none")}
            >
              Fechar editor
            </button>
            <button
              type="button"
              disabled={
                saving ||
                !draft.value.text.trim() ||
                draft.view?.status === "persisting" ||
                draft.view?.status === "error"
              }
              className="min-h-11 flex-1 rounded-xl bg-primary px-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              onClick={async () => {
                setSaving(true);
                try {
                  await controller.ensureLocal();
                  await controller.flush();
                  const row = await props.saver.run(
                    () =>
                      add({
                        data: {
                          inspectionId: props.inspectionId,
                          roomId: props.roomId,
                          itemId: props.itemId,
                          clientKey: draft.value.clientKey,
                          source: "texto",
                          audioPath: null,
                          audioMime: null,
                          audioSeconds: null,
                          text: draft.value.text.trim(),
                        },
                      }),
                    (f, n) => ({ ...f, notes: replaceRow(f.notes, n) }),
                  );
                  if (row) {
                    await draft.discard();
                    props.setMode("none");
                    toast.success("Descrição salva. Revise o texto para incluí-lo no termo.");
                  }
                } catch (e) {
                  toast.error(
                    e instanceof Error
                      ? e.message
                      : "Falha ao salvar o relato. O rascunho foi preservado.",
                  );
                } finally {
                  setSaving(false);
                }
              }}
            >
              {props.rental ? "Salvar descrição" : "Salvar relato"}
            </button>
          </div>
        </div>
      )}
      {(waiting.length > 0 || props.notes.length > 0) && (
        <ul className="space-y-3">
          {waiting.map((entry) => (
            <li key={entry.key}>
              <PendingAudio entry={entry} onRetry={props.onRetry} />
            </li>
          ))}
          {props.notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              items={props.items}
              readOnly={props.readOnly}
              saver={props.saver}
              voiceReady={props.voiceReady}
              voiceAdmin={Boolean(props.voiceAdmin)}
              runner={props.runner}
              onRerecord={props.onRerecord}
              currentCtx={props.currentCtx}
              inspectionId={props.inspectionId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function PendingAudio({ entry, onRetry }: { entry: PendingEntry; onRetry: (key: string) => void }) {
  const [listening, setListening] = useState(false);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!listening) return;
    const source = URL.createObjectURL(entry.blob);
    setUrl(source);
    return () => URL.revokeObjectURL(source);
  }, [entry.blob, listening]);
  return (
    <div className="rounded-xl border p-3 text-sm">
      <p className="font-medium">Áudio · {Math.round(entry.seconds ?? 0)} s</p>
      <p className="text-xs text-foreground/60" role="status">
        {entry.status === "enviando" ? "Enviando" : "Salvo neste aparelho"}
      </p>
      {url ? (
        <audio controls aria-label="Áudio salvo neste aparelho" className="mt-2 w-full" src={url} />
      ) : (
        <button
          type="button"
          className="min-h-11 text-primary underline"
          onClick={() => setListening(true)}
        >
          Ouvir áudio
        </button>
      )}
      {entry.status === "erro" && (
        <button
          type="button"
          className="min-h-11 px-2 text-destructive underline"
          onClick={() => onRetry(entry.key)}
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}

export function NoteCard({
  note,
  items,
  readOnly,
  saver,
  voiceReady,
  voiceAdmin,
  runner,
  onRerecord,
  currentCtx,
  inspectionId,
}: {
  note: NoteRow;
  items: ItemRow[];
  readOnly: boolean;
  saver: Saver;
  voiceReady: boolean;
  voiceAdmin: boolean;
  runner?: Runner;
  onRerecord?: (note: NoteRow) => void;
  currentCtx: React.MutableRefObject<VoiceContext | null>;
  inspectionId: string;
}) {
  const upd = useServerFn(updateNote);
  const updItem = useServerFn(updateItem);
  const transcribe = useServerFn(transcribeNote);
  const removeVoice = useServerFn(deleteVoiceNote);
  const sign = useServerFn(signInspectionFiles);
  const qc = useQueryClient();
  const useSessionId = useSession()?.id;
  const draft = useDraftRow("note", note, note.id, note.room_id);
  const { controller, pending } = useDrafts();
  const approved = draft.value.approved_text ?? note.transcript_original ?? "";
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | "excluir" | "regravar">(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [target, setTarget] = useState<Record<number, string>>({});
  const obs: OrganizedObservation[] = note.suggestion?.observacoes ?? [];
  const label = {
    pendente_transcricao: "Aguardando transcrição",
    transcrito: "Aguardando sua revisão",
    revisado: "Revisado",
    descartado: "Descartado",
  }[note.status as string];

  const view = transcriptionView(note, Date.now());
  const tLabel = transcriptionLabel(view, {
    voiceReady,
    isAdmin: voiceAdmin,
    error: note.transcription_error,
  });
  const hasApproved = Boolean(note.approved_text?.trim()) || note.status === "revisado";

  async function runTranscribe() {
    void currentCtx;
    setBusy(true);
    try {
      const row = runner
        ? await runner.retryNow(note.id)
        : ((await transcribe({ data: { noteId: note.id, manual: true } })) as NoteRow | null);
      if (row && !runner)
        qc.setQueryData<InspectionFull>(inspectionKey(inspectionId, useSessionId), (f) =>
          f ? { ...f, notes: replaceRow(f.notes, row) } : f,
        );
      if (row?.transcript_original) toast.success("Transcrição salva. Revise antes de aprovar.");
      else if (row?.transcription_state === "falhou")
        toast.error(`Não foi possível transcrever: ${row.transcription_error ?? "tente de novo."}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível transcrever agora.");
    } finally {
      setBusy(false);
    }
  }

  async function runDelete() {
    setBusy(true);
    try {
      const res = await removeVoice({ data: { noteId: note.id, reason: "excluir" } });
      runner?.forget(note.id);
      if (useSessionId)
        await removePending(pendingKey(useSessionId, inspectionId, res.clientKey)).catch(
          () => undefined,
        );
      qc.setQueryData<InspectionFull>(inspectionKey(inspectionId, useSessionId), (f) =>
        f ? { ...f, notes: f.notes.filter((n) => n.id !== note.id) } : f,
      );
      void qc.invalidateQueries({ queryKey: inspectionKey(inspectionId, useSessionId) });
      toast.success("Áudio excluído.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o áudio.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <li className="premium-card rounded-2xl p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground/60">
          {note.source === "voz" ? `Voz · ${Math.round(note.audio_seconds ?? 0)} s` : "Digitado"} ·{" "}
          {fmt(note.created_at)}
        </span>
        <span className="text-[11px] font-semibold" role="status">
          {view === "nenhum" || view === "concluida" ? label : null}
        </span>
      </div>
      {note.audio_path &&
        (audioUrl ? (
          <audio
            controls
            controlsList="nodownload noplaybackrate"
            src={audioUrl}
            className="mt-2 w-full"
          />
        ) : (
          <button
            type="button"
            className="mt-2 min-h-11 text-xs font-semibold text-primary"
            onClick={async () => {
              try {
                const u = await sign({ data: { inspectionId, paths: [note.audio_path] } });
                const url = u[note.audio_path!];
                if (!url) throw new Error();
                setAudioUrl(url);
              } catch {
                toast.error("Não foi possível abrir o áudio. Confira a conexão e tente novamente.");
              }
            }}
          >
            Ouvir áudio original
          </button>
        ))}
      {tLabel && (
        <div className="mt-2 flex flex-wrap items-center gap-2" role="status" aria-live="polite">
          <p className="inline-flex items-center gap-1 text-xs text-foreground/70">
            {(tLabel.spinner || busy) && <Loader2 className="size-3 animate-spin" />}
            {tLabel.text}
          </p>
          {tLabel.retry && !readOnly && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void runTranscribe()}
              className="inline-flex min-h-11 items-center rounded-xl border border-input px-3 text-xs font-semibold disabled:opacity-50"
            >
              Tentar de novo
            </button>
          )}
        </div>
      )}
      {note.source === "voz" && !readOnly && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={busy || !onRerecord}
            aria-label="Regravar este áudio"
            onClick={() => (hasApproved ? setConfirm("regravar") : onRerecord?.(note))}
            className="min-h-11 flex-1 rounded-xl border border-input px-3 text-xs font-semibold disabled:opacity-50"
          >
            Regravar
          </button>
          <button
            type="button"
            disabled={busy}
            aria-label="Excluir este áudio"
            onClick={() => setConfirm("excluir")}
            className="min-h-11 flex-1 rounded-xl border border-destructive/40 px-3 text-xs font-semibold text-destructive disabled:opacity-50"
          >
            Excluir áudio
          </button>
        </div>
      )}
      {confirm && (
        <div
          role="alertdialog"
          aria-label="Confirmar"
          className="mt-2 rounded-xl border border-input bg-background p-3"
        >
          <p className="text-sm">
            {confirm === "excluir"
              ? hasApproved
                ? "Excluir este áudio? O texto aprovado deste relato também será removido. Esta ação não pode ser desfeita."
                : "Excluir este áudio? Esta ação não pode ser desfeita."
              : "Regravar substitui este áudio e remove o texto aprovado deste relato depois que o novo for salvo. Continuar?"}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="min-h-11 flex-1 rounded-xl border border-input text-xs font-semibold"
              onClick={() => setConfirm(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              className="min-h-11 flex-1 rounded-xl bg-destructive text-xs font-semibold text-destructive-foreground disabled:opacity-50"
              onClick={() => {
                if (confirm === "excluir") void runDelete();
                else {
                  setConfirm(null);
                  onRerecord?.(note);
                }
              }}
            >
              {confirm === "excluir" ? "Excluir" : "Regravar"}
            </button>
          </div>
        </div>
      )}
      {note.transcript_original && (
        <details className="mt-2 rounded-xl bg-foreground/4 p-2" open={note.status !== "revisado"}>
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
            Registro original
          </summary>
          <p className="text-[11px] font-semibold text-foreground/55">
            {note.source === "voz" ? "Transcrição original" : "Texto original"}
          </p>
          <p className="whitespace-pre-wrap">{note.transcript_original}</p>
        </details>
      )}
      {obs.length > 0 && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] font-semibold text-foreground/55">
            Sugestão organizada (só com o que foi relatado — revise)
          </p>
          {obs.map((o, i) => (
            <div key={i} className="rounded-xl border border-input p-2">
              <p>{observationText(o) || "—"}</p>
              {!readOnly && (
                <div className="mt-2 flex gap-2">
                  <select
                    aria-label="Item de destino"
                    value={target[i] ?? ""}
                    onChange={(e) => setTarget({ ...target, [i]: e.target.value })}
                    className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="">Escolha o item</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!target[i]}
                    className="min-h-11 rounded-xl bg-primary/10 px-3 text-xs font-semibold text-primary disabled:opacity-40"
                    onClick={() => {
                      const it = items.find((x) => x.id === target[i]);
                      if (!it) return;
                      const add = observationText(o);
                      void saver
                        .run(
                          () =>
                            updItem({
                              data: {
                                id: it.id,
                                expectedRevision: it.revision,
                                patch: { notes: [it.notes, add].filter(Boolean).join("\n") },
                              },
                            }),
                          (f, row) => ({ ...f, items: replaceRow(f.items, row) }),
                        )
                        .then(() =>
                          toast.success(
                            `Adicionado à observação de “${it.name}”. O estado do item não foi alterado.`,
                          ),
                        );
                    }}
                  >
                    Adicionar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {(!readOnly || note.status !== "pendente_transcricao") && (
        <div className="mt-2">
          <Textarea
            disabled={readOnly || note.status === "descartado"}
            aria-label={
              note.status === "pendente_transcricao"
                ? "Digitar descrição manualmente"
                : "Texto aprovado do relato"
            }
            rows={3}
            value={approved}
            onChange={(e) => draft.set({ approved_text: e.target.value, status: "transcrito" })}
          />
          {!readOnly && (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="min-h-11 flex-1 rounded-xl border border-input text-xs font-semibold"
                onClick={() =>
                  void saver.run(
                    () =>
                      upd({
                        data: {
                          id: note.id,
                          expectedRevision: note.revision,
                          patch: { status: "descartado" },
                        },
                      }),
                    (f, row) => ({ ...f, notes: replaceRow(f.notes, row) }),
                  )
                }
              >
                Descartar
              </button>
              <button
                type="button"
                disabled={!approved.trim() || pending.some((v) => v.entry.entityId === note.id)}
                className="min-h-11 flex-1 rounded-xl bg-primary text-xs font-semibold text-primary-foreground disabled:opacity-40"
                onClick={() =>
                  void saver.run(
                    () =>
                      upd({
                        data: {
                          id: note.id,
                          expectedRevision: note.revision,
                          patch: { status: "revisado", approved_text: approved.trim() },
                        },
                      }),
                    (f, row) => ({ ...f, notes: replaceRow(f.notes, row) }),
                  )
                }
              >
                Aprovar relato
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/* ============================ Dados ============================ */
