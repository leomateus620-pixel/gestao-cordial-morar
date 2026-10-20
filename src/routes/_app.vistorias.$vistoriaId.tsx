import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CloudOff,
  Download,
  FileText,
  ImagePlus,
  Keyboard,
  Loader2,
  Mic,
  Pencil,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSession } from "@/lib/auth-mock";
import {
  INSPECTION_KINDS,
  ITEM_STATES,
  ITEM_STATE_LABEL,
  KIND_LABEL,
  METER_LABEL,
  METER_STATUS_LABEL,
  STATUS_LABEL,
  emptyMeters,
  itemResolved,
  observationText,
  progress,
  reviewIssues,
  shouldApplyVoiceResult,
  type InspectionKind,
  type InspectionStatus,
  type ItemState,
  type Meters,
  type MeterStatus,
  type OrganizedObservation,
  type RoomKind,
  type VoiceContext,
  documentPath,
} from "@/lib/vistoria/model";
import {
  addItem,
  addRoom,
  deleteItem,
  deleteMedia,
  deleteRoom,
  finalizeInspection,
  reopenInspection,
  reorderRooms,
  signInspectionDocument,
  signInspectionFiles,
  updateInspectionBasics,
  updateItem,
  updateMedia,
  updateNote,
  updateRoom,
  createNote,
  type InspectionFull,
} from "@/lib/vistoria/vistoria.functions";
import { getVoiceStatus, transcribeNote } from "@/lib/vistoria/voice.functions";
import { inspectionKey, replaceRow, useInspection, useLocalQueue, useObjectUrls, useSaver, BUCKET } from "@/lib/vistoria/use-inspection";
import { newClientKey, putPending, type PendingEntry } from "@/lib/vistoria/local-store";
import { deliverPdf, prepareImage, sha256Hex, startRecorder, type Recorder } from "@/lib/vistoria/media-client";
import { toPdfModel } from "@/lib/vistoria/pdf-model";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { STATUS_TONE } from "@/lib/vistoria/ui";

export const Route = createFileRoute("/_app/vistorias/$vistoriaId")({
  head: () => ({
    meta: [
      { title: "Vistoria — Gestão Cordial" },
      { name: "description", content: "Execução, revisão e laudo da vistoria." },
      { property: "og:title", content: "Vistoria — Gestão Cordial" },
      { property: "og:description", content: "Execução, revisão e laudo da vistoria." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequireModuleAccess module="vistorias">
      <VistoriaPage />
    </RequireModuleAccess>
  ),
});

type Tab = "ambientes" | "dados" | "revisao";
const STATE_TONE: Record<ItemState, string> = {
  pendente: "border-input text-foreground/60",
  bom: "border-emerald-600 bg-emerald-600/10 text-emerald-800",
  regular: "border-amber-600 bg-amber-500/10 text-amber-800",
  ruim: "border-destructive bg-destructive/10 text-destructive",
  nao_testado: "border-foreground/40 bg-foreground/5 text-foreground/80",
  nao_se_aplica: "border-foreground/30 bg-foreground/5 text-foreground/70",
};
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

function VistoriaPage() {
  const { vistoriaId } = Route.useParams();
  const session = useSession();
  const qc = useQueryClient();
  const full = useInspection(vistoriaId);
  const voiceFn = useServerFn(getVoiceStatus);
  const voice = useQuery({ queryKey: ["vistoria-voice-status"], queryFn: () => voiceFn(), staleTime: 60_000 });
  const voiceReady = Boolean(voice.data?.transcribe.ready);
  const queue = useLocalQueue(session?.id, vistoriaId, voiceReady);
  const saver = useSaver(vistoriaId);
  const [tab, setTab] = useState<Tab>("ambientes");
  const [roomId, setRoomId] = useState<string | null>(null);

  const data = full.data;
  useEffect(() => {
    if (!data?.rooms.length) return;
    const saved = sessionStorage.getItem(`vistoria:${vistoriaId}:room`);
    setRoomId((cur) => {
      if (cur && data.rooms.some((r) => r.id === cur)) return cur;
      if (saved && data.rooms.some((r) => r.id === saved)) return saved;
      return data.rooms[0].id;
    });
  }, [data?.rooms, vistoriaId]);
  useEffect(() => {
    if (roomId) sessionStorage.setItem(`vistoria:${vistoriaId}:room`, roomId);
  }, [roomId, vistoriaId]);

  if (full.isLoading) return <div className="grid place-items-center py-20"><Loader2 className="size-6 animate-spin text-foreground/50" /></div>;
  if (full.error || !data)
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <p className="font-semibold">Não foi possível abrir a vistoria</p>
        <p className="mt-1 text-sm text-foreground/60">{(full.error as Error)?.message}</p>
        <Link to="/vistorias" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary">Voltar</Link>
      </div>
    );

  const insp = data.inspection;
  const readOnly = insp.status === "concluida";
  const prog = progress(data.rooms, data.items);
  const snap = insp.property_snapshot ?? {};

  return (
    <div className="mx-auto w-full max-w-2xl pb-40 lg:pb-10">
      <header className="sticky top-0 z-20 -mx-4 mb-3 border-b border-border/50 bg-background/92 px-4 pb-2 pt-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <Link to="/vistorias" aria-label="Voltar às vistorias" className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-foreground/5">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">Nº {insp.numero} · {KIND_LABEL[insp.kind as InspectionKind]}</p>
            <p className="truncate text-xs text-foreground/60">{snap.endereco}</p>
          </div>
          <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", STATUS_TONE[insp.status as InspectionStatus])}>
            {STATUS_LABEL[insp.status as InspectionStatus]}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-foreground/60" aria-live="polite">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-valuenow={prog.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso dos itens">
            <div className="h-full bg-primary transition-all" style={{ width: `${prog.percent}%` }} />
          </div>
          <span className="tabular-nums">{prog.done}/{prog.total} itens · {prog.roomsDone}/{prog.rooms} amb.</span>
        </div>
        <SaveIndicator state={saver.state} pending={queue.pending} serverTime={data.serverTime} />
        <nav className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-foreground/5 p-1" aria-label="Seções da vistoria">
          {(["ambientes", "dados", "revisao"] as Tab[]).map((t) => (
            <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={cn("min-h-11 rounded-lg text-sm font-semibold", tab === t ? "bg-background shadow-sm" : "text-foreground/60")}>
              {{ ambientes: "Ambientes", dados: "Dados", revisao: "Revisão" }[t]}
            </button>
          ))}
        </nav>
      </header>

      {tab === "ambientes" && (
        <RoomsTab
          data={data}
          roomId={roomId}
          setRoomId={setRoomId}
          readOnly={readOnly}
          saver={saver}
          queue={queue}
          userId={session?.id}
          voiceReady={voiceReady}
          voiceMissing={voice.data?.transcribe.missing ?? []}
        />
      )}
      {tab === "dados" && <DataTab data={data} readOnly={readOnly} saver={saver} />}
      {tab === "revisao" && (
        <ReviewTab
          data={data}
          pending={queue.pending}
          saver={saver}
          onJump={(rid, itemId) => {
            setTab("ambientes");
            setRoomId(rid);
            if (itemId) setTimeout(() => document.getElementById(`item-${itemId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
          }}
          refetch={() => qc.invalidateQueries({ queryKey: inspectionKey(vistoriaId) })}
        />
      )}
    </div>
  );
}

function SaveIndicator({ state, pending, serverTime }: { state: ReturnType<typeof useSaver>["state"]; pending: PendingEntry[]; serverTime: string }) {
  const local = pending.length;
  const errors = pending.filter((p) => p.status === "erro").length;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px]" aria-live="polite">
      {state.kind === "saving" && <span className="text-foreground/60"><Loader2 className="mr-1 inline size-3 animate-spin" />Salvando…</span>}
      {state.kind === "saved" && <span className="text-emerald-700"><Check className="mr-1 inline size-3" />Salvo no servidor às {fmt(state.at)}</span>}
      {state.kind === "idle" && <span className="text-foreground/55">Sincronizado às {fmt(serverTime)}</span>}
      {state.kind === "error" && <span className="text-destructive"><AlertTriangle className="mr-1 inline size-3" />{state.message}</span>}
      {state.kind === "conflict" && <span className="text-amber-700"><AlertTriangle className="mr-1 inline size-3" />{state.message}</span>}
      {local > 0 && (
        <span className={errors ? "text-destructive" : "text-amber-700"}>
          <CloudOff className="mr-1 inline size-3" />
          {local} arquivo(s) só neste aparelho{errors ? ` · ${errors} com erro` : ""}
        </span>
      )}
    </p>
  );
}

/* ============================ Ambientes ============================ */

type Saver = ReturnType<typeof useSaver>;
type Queue = ReturnType<typeof useLocalQueue>;

function RoomsTab(props: {
  data: InspectionFull;
  roomId: string | null;
  setRoomId: (id: string) => void;
  readOnly: boolean;
  saver: Saver;
  queue: Queue;
  userId?: string;
  voiceReady: boolean;
  voiceMissing: string[];
}) {
  const { data, roomId, setRoomId, readOnly, saver, queue } = props;
  const insp = data.inspection;
  const room = data.rooms.find((r) => r.id === roomId) ?? null;
  const idx = room ? data.rooms.findIndex((r) => r.id === room.id) : -1;
  const addRoomFn = useServerFn(addRoom);
  const delRoomFn = useServerFn(deleteRoom);
  const updRoomFn = useServerFn(updateRoom);
  const reorderFn = useServerFn(reorderRooms);
  const updInsp = useServerFn(updateInspectionBasics);
  const [adding, setAdding] = useState<{ name: string; kind: RoomKind } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mode, setMode] = useState<"none" | "texto">("none");
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const furnished = insp.furnished === "mobiliado" || insp.furnished === "semimobiliado";

  const markStarted = useCallback(async () => {
    if (insp.status !== "rascunho") return;
    try {
      await saver.run(() => updInsp({ data: { id: insp.id, expectedRevision: insp.revision, patch: { status: "em_andamento" } } }), (f, row) => ({ ...f, inspection: row }));
    } catch {
      /* indicador já mostra */
    }
  }, [insp.id, insp.revision, insp.status, saver, updInsp]);

  /* ---------- Voz ---------- */
  const recRef = useRef<{ rec: Recorder; ctx: VoiceContext; startedAt: number; timer: number } | null>(null);
  const [recording, setRecording] = useState<{ startedAt: number; roomName: string } | null>(null);
  const [level, setLevel] = useState(0);
  const currentCtx = useRef<VoiceContext | null>(null);
  const sessionId = useRef(newClientKey());
  currentCtx.current = room ? { inspectionId: insp.id, roomId: room.id, sessionId: sessionId.current } : null;

  const saveSegment = useCallback(
    async (rec: Recorder, ctx: VoiceContext) => {
      try {
        const { blob, seconds } = await rec.stop();
        if (!props.userId) return;
        await putPending({
          userId: props.userId,
          inspectionId: ctx.inspectionId,
          roomId: ctx.roomId,
          itemId: null,
          clientKey: newClientKey(),
          kind: "audio",
          blob,
          mime: "audio/wav",
          seconds,
          takenAt: new Date().toISOString(),
          timeSource: "captura",
          status: "local",
          attempts: 0,
          createdAt: new Date().toISOString(),
        });
        await queue.refresh();
        void queue.process();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao salvar o áudio");
      }
    },
    [props.userId, queue],
  );

  const stopRecording = useCallback(async () => {
    const cur = recRef.current;
    if (!cur) return;
    recRef.current = null;
    window.clearInterval(cur.timer);
    setRecording(null);
    await saveSegment(cur.rec, cur.ctx);
  }, [saveSegment]);

  const startRecording = useCallback(async () => {
    if (!room || recRef.current) return;
    const ctx: VoiceContext = { inspectionId: insp.id, roomId: room.id, sessionId: sessionId.current };
    try {
      const rec = await startRecorder(() => {
        toast.warning("Gravação interrompida pelo sistema. O trecho gravado foi salvo.");
        void stopRecording();
      });
      const startedAt = Date.now();
      const timer = window.setInterval(async () => {
        const cur = recRef.current;
        if (!cur) return;
        setLevel(cur.rec.level());
        // Segmenta a cada 60 s: cada trecho é um WAV completo salvo localmente.
        if (Date.now() - cur.startedAt > 60_000) {
          const next = await startRecorder().catch(() => null);
          const old = cur.rec;
          if (next) {
            recRef.current = { ...cur, rec: next, startedAt: Date.now() };
          } else {
            recRef.current = null;
            window.clearInterval(cur.timer);
            setRecording(null);
          }
          await saveSegment(old, cur.ctx);
        }
      }, 250);
      recRef.current = { rec, ctx, startedAt, timer };
      setRecording({ startedAt, roomName: room.name });
      void markStarted();
    } catch (e) {
      const name = (e as { name?: string })?.name;
      toast.error(
        name === "NotAllowedError"
          ? "Permissão do microfone negada. Libere o microfone nas configurações do navegador."
          : name === "NotFoundError"
            ? "Nenhum microfone encontrado."
            : e instanceof Error ? e.message : "Não foi possível gravar.",
      );
    }
  }, [room, insp.id, stopRecording, saveSegment, markStarted]);

  // Trocar de cômodo ou sair da tela encerra e salva o trecho no cômodo de origem.
  useEffect(() => {
    return () => {
      if (recRef.current) void stopRecording();
    };
  }, [roomId, stopRecording]);

  /* ---------- Fotos ---------- */
  async function onFiles(files: FileList | null, source: "captura" | "importacao") {
    if (!files?.length || !room || !props.userId) return;
    const ctxRoom = room.id;
    let ok = 0;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name}: não é uma imagem.`);
        continue;
      }
      try {
        const { blob, width, height } = await prepareImage(file);
        await putPending({
          userId: props.userId,
          inspectionId: insp.id,
          roomId: ctxRoom,
          itemId: null,
          clientKey: newClientKey(),
          kind: "photo",
          blob,
          mime: "image/jpeg",
          width,
          height,
          takenAt: new Date().toISOString(),
          timeSource: source,
          status: "local",
          attempts: 0,
          createdAt: new Date().toISOString(),
        });
        ok++;
      } catch (e) {
        // Se a conversão falhar, guarda o original para não perder a foto.
        if (file.type === "image/jpeg" || file.type === "image/png") {
          await putPending({
            userId: props.userId,
            inspectionId: insp.id,
            roomId: ctxRoom,
            itemId: null,
            clientKey: newClientKey(),
            kind: "photo",
            blob: file,
            mime: file.type,
            takenAt: new Date().toISOString(),
            timeSource: source,
            status: "local",
            attempts: 0,
            createdAt: new Date().toISOString(),
          });
          ok++;
        } else toast.error(`${file.name}: ${e instanceof Error ? e.message : "não foi possível ler"}`);
      }
    }
    if (ok) {
      void markStarted();
      await queue.refresh();
      void queue.process();
    }
  }

  if (!data.rooms.length && readOnly) return <p className="text-sm text-foreground/60">Sem ambientes.</p>;

  const roomItems = room ? data.items.filter((i) => i.room_id === room.id) : [];
  const roomMedia = room ? data.media.filter((m) => m.room_id === room.id) : [];
  const roomNotes = room ? data.notes.filter((n) => n.room_id === room.id) : [];
  const roomPending = room ? queue.pending.filter((p) => p.roomId === room.id) : [];
  const hasData = roomMedia.length > 0 || roomNotes.length > 0 || roomItems.some((i) => i.state !== "pendente" || i.notes || i.damage);

  return (
    <div>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Ambientes">
        {data.rooms.map((r) => {
          const its = data.items.filter((i) => i.room_id === r.id);
          const done = its.length > 0 && its.every(itemResolved);
          return (
            <button
              key={r.id}
              role="tab"
              aria-selected={r.id === roomId}
              type="button"
              onClick={() => setRoomId(r.id)}
              className={cn("min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium", r.id === roomId ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background", done && r.id !== roomId && "border-emerald-600/50")}
            >
              {done && <Check className="mr-1 inline size-3.5" />}
              {r.name}
            </button>
          );
        })}
        {!readOnly && (
          <button type="button" onClick={() => setAdding({ name: "", kind: "outro" })} className="min-h-11 shrink-0 rounded-full border border-dashed border-primary/50 px-4 text-sm font-medium text-primary">
            <Plus className="mr-1 inline size-4" />Ambiente
          </button>
        )}
      </div>

      {adding && (
        <div className="premium-card mb-3 space-y-2 rounded-2xl p-3">
          <Input autoFocus aria-label="Nome do ambiente" placeholder="Ex.: Varanda" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} className="h-11" />
          <select aria-label="Tipo do ambiente" value={adding.kind} onChange={(e) => setAdding({ ...adding, kind: e.target.value as RoomKind })} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
            {(["sala", "dormitorio", "suite", "banheiro", "cozinha", "servico", "garagem", "externa", "comercial", "terreno", "outro"] as RoomKind[]).map((k) => (
              <option key={k} value={k}>{k === "externa" ? "Área externa / varanda" : k === "servico" ? "Área de serviço" : k.charAt(0).toUpperCase() + k.slice(1)}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button type="button" className="min-h-11 flex-1 rounded-xl border border-input text-sm" onClick={() => setAdding(null)}>Cancelar</button>
            <button
              type="button"
              disabled={!adding.name.trim()}
              className="min-h-11 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40"
              onClick={async () => {
                const created = await saver.run(() => addRoomFn({ data: { inspectionId: insp.id, name: adding.name.trim(), kind: adding.kind, furnished } }));
                setAdding(null);
                await props.queue.refresh();
                if (created) {
                  await new Promise((r) => setTimeout(r, 0));
                  setRoomId(created.id);
                }
              }}
            >
              Adicionar
            </button>
          </div>
        </div>
      )}

      {room && (
        <section aria-label={`Ambiente ${room.name}`}>
          <div className="mb-3 flex items-center gap-2">
            {renaming !== null ? (
              <>
                <Input autoFocus aria-label="Novo nome" value={renaming} onChange={(e) => setRenaming(e.target.value)} className="h-11" />
                <button
                  type="button"
                  aria-label="Salvar nome"
                  className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"
                  onClick={async () => {
                    if (!renaming.trim()) return;
                    await saver.run(() => updRoomFn({ data: { id: room.id, expectedRevision: room.revision, patch: { name: renaming.trim() } } }), (f, row) => ({ ...f, rooms: replaceRow(f.rooms, row) }));
                    setRenaming(null);
                  }}
                >
                  <Check className="size-4" />
                </button>
              </>
            ) : (
              <>
                <h2 className="min-w-0 flex-1 truncate text-lg font-bold">{room.name}</h2>
                {!readOnly && (
                  <>
                    <button type="button" aria-label="Renomear ambiente" onClick={() => setRenaming(room.name)} className="grid size-11 place-items-center rounded-xl hover:bg-foreground/5"><Pencil className="size-4" /></button>
                    <button
                      type="button"
                      aria-label="Mover ambiente para a esquerda"
                      disabled={idx <= 0}
                      onClick={() => {
                        const order = data.rooms.map((r) => r.id);
                        [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
                        void saver.run(() => reorderFn({ data: { inspectionId: insp.id, order } }), (f) => ({ ...f, rooms: order.map((id, p) => ({ ...f.rooms.find((r) => r.id === id)!, position: p })) }));
                      }}
                      className="grid size-11 place-items-center rounded-xl hover:bg-foreground/5 disabled:opacity-30"
                    >
                      <ArrowLeft className="size-4" />
                    </button>
                    <button type="button" aria-label="Remover ambiente" onClick={() => (hasData ? setConfirmDelete(true) : void saver.run(() => delRoomFn({ data: { id: room.id, inspectionId: insp.id, confirmed: true } }), (f) => ({ ...f, rooms: f.rooms.filter((r) => r.id !== room.id), items: f.items.filter((i) => i.room_id !== room.id) })))} className="grid size-11 place-items-center rounded-xl text-destructive hover:bg-destructive/10"><Trash2 className="size-4" /></button>
                  </>
                )}
              </>
            )}
          </div>

          <PhotosBlock
            inspectionId={insp.id}
            media={roomMedia}
            pending={roomPending}
            readOnly={readOnly}
            saver={saver}
            onRetry={queue.retry}
            items={roomItems}
          />
          {!roomMedia.some((m) => m.status === "confirmada") && (
            <NoPhotoReason room={room} readOnly={readOnly} saver={saver} />
          )}

          <ul className="mt-4 space-y-2">
            {roomItems.map((it) => (
              <ItemCard key={it.id} item={it} readOnly={readOnly} saver={saver} onTouched={markStarted} />
            ))}
          </ul>
          {!readOnly && <AddItem inspectionId={insp.id} roomId={room.id} saver={saver} />}

          <NotesBlock
            notes={roomNotes}
            items={roomItems}
            readOnly={readOnly}
            saver={saver}
            voiceReady={props.voiceReady}
            inspectionId={insp.id}
            currentCtx={currentCtx}
            mode={mode}
            setMode={setMode}
            roomId={room.id}
          />
        </section>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover “{room?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>Este ambiente tem avaliações, fotos ou relatos. Tudo dele será removido desta vistoria.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => room && void saver.run(() => delRoomFn({ data: { id: room.id, inspectionId: insp.id, confirmed: true } }), (f) => ({ ...f, rooms: f.rooms.filter((r) => r.id !== room.id), items: f.items.filter((i) => i.room_id !== room.id), media: f.media.filter((m) => m.room_id !== room.id), notes: f.notes.filter((n) => n.room_id !== room.id) }))}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <input ref={camRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { void onFiles(e.target.files, "captura"); e.target.value = ""; }} />
      <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void onFiles(e.target.files, "importacao"); e.target.value = ""; }} />

      {!readOnly && room && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/96 px-3 pt-2 backdrop-blur pb-[calc(0.5rem+env(safe-area-inset-bottom))] lg:sticky lg:mt-6 lg:rounded-2xl lg:border">
          {recording ? (
            <div className="mx-auto flex max-w-2xl items-center gap-2">
              <span className="relative grid size-11 place-items-center" aria-hidden>
                <span className="absolute inset-0 animate-ping rounded-full bg-destructive/25" style={{ transform: `scale(${0.7 + level * 1.5})` }} />
                <Mic className="size-5 text-destructive" />
              </span>
              <div className="min-w-0 flex-1 text-sm" aria-live="polite">
                <p className="font-semibold">Gravando · {recording.roomName}</p>
                <RecTimer startedAt={recording.startedAt} />
              </div>
              <button type="button" onClick={() => void stopRecording()} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground">
                <Square className="size-4" /> Parar
              </button>
            </div>
          ) : (
            <div className="mx-auto grid max-w-2xl grid-cols-5 gap-1">
              <BarButton icon={<Camera className="size-5" />} label="Câmera" onClick={() => camRef.current?.click()} />
              <BarButton icon={<ImagePlus className="size-5" />} label="Galeria" onClick={() => galRef.current?.click()} />
              <BarButton
                icon={<Mic className="size-5" />}
                label="Voz"
                onClick={() => void startRecording()}
                hint={props.voiceReady ? undefined : "Grava e guarda; transcrição aguarda ativação"}
              />
              <BarButton icon={<Keyboard className="size-5" />} label="Digitar" onClick={() => { setMode("texto"); setTimeout(() => document.getElementById("note-text")?.focus(), 50); }} />
              <BarButton
                icon={<ArrowRight className="size-5" />}
                label="Próximo"
                disabled={idx >= data.rooms.length - 1}
                onClick={() => { setRoomId(data.rooms[idx + 1].id); window.scrollTo({ top: 0 }); }}
              />
            </div>
          )}
          {!props.voiceReady && !recording && (
            <p className="mx-auto mt-1 max-w-2xl text-center text-[10px] text-foreground/50">
              Transcrição por voz ainda não ativada: {props.voiceMissing.join(" · ") || "configuração pendente"}. Os áudios ficam salvos para transcrever depois.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function RecTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const s = Math.floor((now - startedAt) / 1000);
  return <p className="text-xs tabular-nums text-foreground/60">{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")} · trechos de 60 s salvos no aparelho</p>;
}

function BarButton({ icon, label, onClick, disabled, hint }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; hint?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={hint} aria-label={hint ? `${label} — ${hint}` : label} className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold text-foreground/80 active:bg-foreground/8 disabled:opacity-35">
      {icon}
      {label}
    </button>
  );
}

function NoPhotoReason({ room, readOnly, saver }: { room: any; readOnly: boolean; saver: Saver }) {
  const upd = useServerFn(updateRoom);
  const [v, setV] = useState(room.no_photo_reason ?? "");
  useEffect(() => setV(room.no_photo_reason ?? ""), [room.no_photo_reason]);
  return (
    <label className="mt-2 block">
      <span className="text-xs font-semibold text-foreground/60">Sem foto possível? Registre o motivo</span>
      <Input
        disabled={readOnly}
        value={v}
        placeholder="Ex.: cômodo trancado, sem iluminação"
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== (room.no_photo_reason ?? "") && void saver.run(() => upd({ data: { id: room.id, expectedRevision: room.revision, patch: { no_photo_reason: v.trim() || null } } }), (f, row) => ({ ...f, rooms: replaceRow(f.rooms, row) })).catch(() => undefined)}
        className="mt-1 h-11"
      />
    </label>
  );
}

/* ---------------- Itens ---------------- */

function ItemCard({ item, readOnly, saver, onTouched }: { item: any; readOnly: boolean; saver: Saver; onTouched: () => void }) {
  const upd = useServerFn(updateItem);
  const del = useServerFn(deleteItem);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ material: "", color: "", notes: "", damage: "", untested_reason: "", quantity: "" });
  useEffect(() => {
    setDraft({
      material: item.material ?? "",
      color: item.color ?? "",
      notes: item.notes ?? "",
      damage: item.damage ?? "",
      untested_reason: item.untested_reason ?? "",
      quantity: item.quantity == null ? "" : String(item.quantity),
    });
  }, [item.revision]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (patch: Record<string, unknown>) =>
    saver.run(() => upd({ data: { id: item.id, expectedRevision: item.revision, patch } }), (f, row) => ({ ...f, items: replaceRow(f.items, row) })).catch(() => undefined);
  const blurSave = (k: keyof typeof draft) => {
    const cur = k === "quantity" ? (item.quantity == null ? "" : String(item.quantity)) : (item[k] ?? "");
    if (draft[k] === cur) return;
    void save({ [k]: k === "quantity" ? (draft.quantity.trim() === "" ? null : Number(draft.quantity)) : draft[k].trim() || null });
  };
  const resolved = itemResolved(item);
  const needs = item.state === "ruim" ? "Descreva a avaria" : item.state === "nao_testado" ? "Informe o motivo" : null;

  return (
    <li id={`item-${item.id}`} className={cn("premium-card rounded-2xl p-3", !resolved && item.state !== "pendente" && "ring-1 ring-amber-500/60")}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-11 w-full items-center justify-between gap-2 text-left">
        <span className="font-semibold">{item.name}</span>
        <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", STATE_TONE[item.state as ItemState])}>{ITEM_STATE_LABEL[item.state as ItemState]}</span>
      </button>
      <div className="mt-2 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={`Estado de ${item.name}`}>
        {ITEM_STATES.filter((s) => s !== "pendente").map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={item.state === s}
            disabled={readOnly}
            onClick={() => {
              onTouched();
              void save({ state: s });
              if (s === "ruim" || s === "nao_testado") setOpen(true);
            }}
            className={cn("min-h-11 rounded-xl border text-xs font-semibold", item.state === s ? STATE_TONE[s] : "border-input text-foreground/70")}
          >
            {ITEM_STATE_LABEL[s]}
          </button>
        ))}
      </div>
      {needs && !resolved && <p className="mt-2 text-xs font-medium text-amber-700">{needs} para concluir este item.</p>}
      {(open || needs) && (
        <div className="mt-3 space-y-2">
          {item.state === "nao_testado" && (
            <Input disabled={readOnly} aria-label="Motivo de não testar" placeholder="Motivo (ex.: sem energia, sem água)" value={draft.untested_reason} onChange={(e) => setDraft({ ...draft, untested_reason: e.target.value })} onBlur={() => blurSave("untested_reason")} className="h-11" />
          )}
          {item.state === "ruim" && (
            <Textarea disabled={readOnly} aria-label="Descrição da avaria" placeholder="Avaria: o quê, onde, tamanho aproximado" value={draft.damage} onChange={(e) => setDraft({ ...draft, damage: e.target.value })} onBlur={() => blurSave("damage")} rows={2} />
          )}
          {open && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Input disabled={readOnly} aria-label="Material" placeholder="Material" value={draft.material} onChange={(e) => setDraft({ ...draft, material: e.target.value })} onBlur={() => blurSave("material")} className="h-11" />
                <Input disabled={readOnly} aria-label="Cor" placeholder="Cor" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} onBlur={() => blurSave("color")} className="h-11" />
              </div>
              <Input disabled={readOnly} aria-label="Quantidade" inputMode="numeric" placeholder="Quantidade" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".") })} onBlur={() => blurSave("quantity")} className="h-11" />
              <Textarea disabled={readOnly} aria-label="Observação" placeholder="Observação" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} onBlur={() => blurSave("notes")} rows={2} />
              {!readOnly && (
                <div className="flex justify-between">
                  <button type="button" className="min-h-11 text-xs font-medium text-foreground/60" onClick={() => void save({ state: "pendente" })}>Voltar a pendente</button>
                  <button
                    type="button"
                    className="min-h-11 text-xs font-medium text-destructive"
                    onClick={() => {
                      if (confirm(`Remover o item “${item.name}”?`)) void saver.run(() => del({ data: { id: item.id } }), (f) => ({ ...f, items: f.items.filter((i) => i.id !== item.id) }));
                    }}
                  >
                    Remover item
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

function AddItem({ inspectionId, roomId, saver }: { inspectionId: string; roomId: string; saver: Saver }) {
  const add = useServerFn(addItem);
  const [v, setV] = useState("");
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        void saver.run(() => add({ data: { inspectionId, roomId, name: v.trim(), category: "especifico" } }), (f, row) => ({ ...f, items: [...f.items, row] })).then(() => setV(""));
      }}
    >
      <Input aria-label="Novo item" placeholder="Adicionar item (ex.: ar-condicionado)" value={v} onChange={(e) => setV(e.target.value)} className="h-11" />
      <button type="submit" aria-label="Adicionar item" className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Plus className="size-4" /></button>
    </form>
  );
}

/* ---------------- Fotos ---------------- */

function PhotosBlock(props: { inspectionId: string; media: any[]; pending: PendingEntry[]; readOnly: boolean; saver: Saver; onRetry: (k: string) => void; items: any[] }) {
  const sign = useServerFn(signInspectionFiles);
  const paths = props.media.map((m) => m.storage_path);
  const urls = useQuery({
    queryKey: ["inspection-urls", props.inspectionId, paths.join("|")],
    queryFn: () => sign({ data: { inspectionId: props.inspectionId, paths } }),
    enabled: paths.length > 0,
    staleTime: 50 * 60_000,
  });
  const localUrls = useObjectUrls(props.pending);
  const [view, setView] = useState<any | null>(null);
  const photos = props.pending.filter((p) => p.kind === "photo");
  if (!props.media.length && !photos.length) return <p className="rounded-2xl border border-dashed border-input p-4 text-center text-sm text-foreground/55">Nenhuma foto neste ambiente. Use Câmera ou Galeria abaixo.</p>;
  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Fotos do ambiente">
        {props.media.map((m, i) => (
          <li key={m.id}>
            <button type="button" onClick={() => setView(m)} className="relative block aspect-square w-full overflow-hidden rounded-xl bg-foreground/8" aria-label={`Abrir foto ${i + 1}${m.caption ? `: ${m.caption}` : ""}`}>
              {urls.data?.[m.storage_path] ? <img src={urls.data[m.storage_path]} alt={m.caption ?? `Foto ${i + 1}`} loading="lazy" decoding="async" className="size-full object-cover" /> : <Loader2 className="m-auto size-4 animate-spin" />}
              <span className="absolute left-1 top-1 rounded-md bg-background/85 px-1 text-[10px] font-bold">{i + 1}</span>
            </button>
          </li>
        ))}
        {photos.map((p) => (
          <li key={p.key}>
            <div className="relative aspect-square overflow-hidden rounded-xl bg-foreground/8">
              {localUrls[p.key] && <img src={localUrls[p.key]} alt="Foto aguardando envio" className="size-full object-cover opacity-70" />}
              <div className="absolute inset-x-0 bottom-0 bg-background/90 p-1 text-center text-[10px] font-semibold">
                {p.status === "erro" ? (
                  <button type="button" onClick={() => props.onRetry(p.key)} className="inline-flex min-h-8 items-center gap-1 text-destructive"><RotateCcw className="size-3" />Tentar de novo</button>
                ) : p.status === "enviando" ? (
                  <span><Loader2 className="mr-1 inline size-3 animate-spin" />Enviando</span>
                ) : (
                  <span>Só no aparelho</span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <PhotoViewer media={view} url={view ? urls.data?.[view.storage_path] : undefined} items={props.items} onClose={() => setView(null)} readOnly={props.readOnly} saver={props.saver} all={props.media} />
    </>
  );
}

function PhotoViewer({ media, url, onClose, readOnly, saver, items, all }: { media: any | null; url?: string; onClose: () => void; readOnly: boolean; saver: Saver; items: any[]; all: any[] }) {
  const upd = useServerFn(updateMedia);
  const del = useServerFn(deleteMedia);
  const [caption, setCaption] = useState("");
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setCaption(media?.caption ?? ""), [media?.id, media?.caption]);
  if (!media) return null;
  const idx = all.findIndex((m) => m.id === media.id);
  const move = async (dir: -1 | 1) => {
    const other = all[idx + dir];
    if (!other) return;
    await saver.run(() => upd({ data: { id: media.id, expectedRevision: media.revision, patch: { position: other.position } } }), (f, row) => ({ ...f, media: replaceRow(f.media, row) }));
    await saver.run(() => upd({ data: { id: other.id, expectedRevision: other.revision, patch: { position: media.position } } }), (f, row) => ({ ...f, media: replaceRow(f.media, row).sort((a, b) => a.position - b.position) }));
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-xl overflow-y-auto p-3">
        <DialogTitle className="text-sm">Foto {idx + 1}</DialogTitle>
        {url ? <img src={url} alt={media.caption ?? `Foto ${idx + 1}`} className="max-h-[55dvh] w-full rounded-xl object-contain" /> : <Loader2 className="mx-auto size-5 animate-spin" />}
        <p className="text-xs text-foreground/60">{media.time_source === "captura" ? "Capturada pela câmera" : "Importada da galeria"} · registrada em {fmt(media.taken_at)} (horário do envio, não do arquivo)</p>
        <Input disabled={readOnly} aria-label="Legenda" placeholder="Legenda" value={caption} onChange={(e) => setCaption(e.target.value)} onBlur={() => caption !== (media.caption ?? "") && void saver.run(() => upd({ data: { id: media.id, expectedRevision: media.revision, patch: { caption: caption.trim() || null } } }), (f, row) => ({ ...f, media: replaceRow(f.media, row) })).catch(() => undefined)} className="h-11" />
        <select
          disabled={readOnly}
          aria-label="Vincular a um item"
          value={media.item_id ?? ""}
          onChange={(e) => void saver.run(() => upd({ data: { id: media.id, expectedRevision: media.revision, patch: { item_id: e.target.value || null } } }), (f, row) => ({ ...f, media: replaceRow(f.media, row) })).catch(() => undefined)}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Foto ampla do ambiente</option>
          {items.map((i) => <option key={i.id} value={i.id}>Item: {i.name}</option>)}
        </select>
        {!readOnly && (
          <div className="flex gap-2">
            <button type="button" disabled={idx <= 0} onClick={() => void move(-1)} className="min-h-11 flex-1 rounded-xl border border-input text-sm disabled:opacity-30">Mover antes</button>
            <button type="button" disabled={idx >= all.length - 1} onClick={() => void move(1)} className="min-h-11 flex-1 rounded-xl border border-input text-sm disabled:opacity-30">Mover depois</button>
            <button type="button" onClick={() => setConfirm(true)} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-destructive" aria-label="Excluir foto"><Trash2 className="size-4" /></button>
          </div>
        )}
        <AlertDialog open={confirm} onOpenChange={setConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir esta foto?</AlertDialogTitle>
              <AlertDialogDescription>Ela será removida da vistoria e do armazenamento.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => void saver.run(() => del({ data: { id: media.id, confirmed: true } }), (f) => ({ ...f, media: f.media.filter((m) => m.id !== media.id) })).then(onClose)}>Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Relatos ---------------- */

function NotesBlock(props: {
  notes: any[];
  items: any[];
  readOnly: boolean;
  saver: Saver;
  voiceReady: boolean;
  inspectionId: string;
  currentCtx: React.MutableRefObject<VoiceContext | null>;
  mode: "none" | "texto";
  setMode: (m: "none" | "texto") => void;
  roomId: string;
}) {
  const add = useServerFn(createNote);
  const [text, setText] = useState("");
  const [key] = useState(() => newClientKey());
  const keyRef = useRef(key);
  return (
    <section className="mt-5" aria-label="Relatos do ambiente">
      <h3 className="mb-2 text-sm font-semibold">Relatos</h3>
      {props.mode === "texto" && !props.readOnly && (
        <div className="premium-card mb-3 space-y-2 rounded-2xl p-3">
          <Textarea id="note-text" aria-label="Relato digitado" rows={3} placeholder="Descreva o que observou neste ambiente" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className="min-h-11 flex-1 rounded-xl border border-input text-sm" onClick={() => props.setMode("none")}>Fechar</button>
            <button
              type="button"
              disabled={!text.trim()}
              className="min-h-11 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40"
              onClick={async () => {
                const ck = keyRef.current;
                await props.saver.run(
                  () => add({ data: { inspectionId: props.inspectionId, roomId: props.roomId, itemId: null, clientKey: ck, source: "texto", audioPath: null, audioMime: null, audioSeconds: null, text: text.trim() } }),
                  (f, row) => ({ ...f, notes: replaceRow(f.notes, row) }),
                );
                keyRef.current = newClientKey();
                setText("");
                props.setMode("none");
              }}
            >
              Salvar relato
            </button>
          </div>
        </div>
      )}
      {!props.notes.length && props.mode !== "texto" && <p className="text-xs text-foreground/55">Sem relatos neste ambiente.</p>}
      <ul className="space-y-2">
        {props.notes.map((n) => (
          <NoteCard key={n.id} note={n} items={props.items} readOnly={props.readOnly} saver={props.saver} voiceReady={props.voiceReady} currentCtx={props.currentCtx} inspectionId={props.inspectionId} />
        ))}
      </ul>
    </section>
  );
}

function NoteCard({ note, items, readOnly, saver, voiceReady, currentCtx, inspectionId }: { note: any; items: any[]; readOnly: boolean; saver: Saver; voiceReady: boolean; currentCtx: React.MutableRefObject<VoiceContext | null>; inspectionId: string }) {
  const upd = useServerFn(updateNote);
  const updItem = useServerFn(updateItem);
  const transcribe = useServerFn(transcribeNote);
  const sign = useServerFn(signInspectionFiles);
  const qc = useQueryClient();
  const [approved, setApproved] = useState(note.approved_text ?? note.transcript_original ?? "");
  const [busy, setBusy] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [target, setTarget] = useState<Record<number, string>>({});
  useEffect(() => setApproved(note.approved_text ?? note.transcript_original ?? ""), [note.revision]); // eslint-disable-line react-hooks/exhaustive-deps
  const obs: OrganizedObservation[] = note.suggestion?.observacoes ?? [];
  const label = { pendente_transcricao: "Áudio aguardando transcrição", transcrito: "Aguardando sua revisão", revisado: "Revisado", descartado: "Descartado" }[note.status as string];

  async function runTranscribe() {
    const origin: VoiceContext = { inspectionId, roomId: note.room_id, sessionId: currentCtx.current?.sessionId ?? "" };
    setBusy(true);
    try {
      const row = await transcribe({ data: { noteId: note.id } });
      qc.setQueryData<InspectionFull>(inspectionKey(inspectionId), (f) => (f && row ? { ...f, notes: replaceRow(f.notes, row) } : f));
      // Resposta atrasada não preenche outro cômodo: só aplica se ainda estivermos aqui.
      if (shouldApplyVoiceResult(currentCtx.current, origin) && row?.transcript_original) setApproved(row.transcript_original);
      else toast.info("Transcrição salva no relato do cômodo de origem.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na transcrição");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="premium-card rounded-2xl p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground/60">{note.source === "voz" ? `Voz · ${Math.round(note.audio_seconds ?? 0)} s` : "Digitado"} · {fmt(note.created_at)}</span>
        <span className="text-[11px] font-semibold">{label}</span>
      </div>
      {note.audio_path && (
        audioUrl ? <audio controls src={audioUrl} className="mt-2 w-full" /> : (
          <button type="button" className="mt-2 min-h-11 text-xs font-semibold text-primary" onClick={async () => { const u = await sign({ data: { inspectionId, paths: [note.audio_path] } }); setAudioUrl(u[note.audio_path] ?? null); }}>Ouvir áudio original</button>
        )
      )}
      {note.status === "pendente_transcricao" && !readOnly && (
        <button type="button" disabled={!voiceReady || busy} onClick={() => void runTranscribe()} className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-xl border border-input px-3 text-xs font-semibold disabled:opacity-50">
          {busy && <Loader2 className="size-3 animate-spin" />}
          {voiceReady ? "Transcrever agora" : "Transcrição indisponível até a ativação da voz"}
        </button>
      )}
      {note.transcript_original && (
        <div className="mt-2 rounded-xl bg-foreground/4 p-2">
          <p className="text-[11px] font-semibold text-foreground/55">{note.source === "voz" ? "Transcrição original" : "Texto original"}</p>
          <p className="whitespace-pre-wrap">{note.transcript_original}</p>
        </div>
      )}
      {obs.length > 0 && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] font-semibold text-foreground/55">Sugestão organizada (só com o que foi relatado — revise)</p>
          {obs.map((o, i) => (
            <div key={i} className="rounded-xl border border-input p-2">
              <p>{observationText(o) || "—"}</p>
              {!readOnly && (
                <div className="mt-2 flex gap-2">
                  <select aria-label="Item de destino" value={target[i] ?? ""} onChange={(e) => setTarget({ ...target, [i]: e.target.value })} className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs">
                    <option value="">Escolha o item</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                  </select>
                  <button
                    type="button"
                    disabled={!target[i]}
                    className="min-h-11 rounded-xl bg-primary/10 px-3 text-xs font-semibold text-primary disabled:opacity-40"
                    onClick={() => {
                      const it = items.find((x) => x.id === target[i]);
                      if (!it) return;
                      const add = observationText(o);
                      void saver.run(() => updItem({ data: { id: it.id, expectedRevision: it.revision, patch: { notes: [it.notes, add].filter(Boolean).join("\n") } } }), (f, row) => ({ ...f, items: replaceRow(f.items, row) })).then(() => toast.success(`Adicionado à observação de “${it.name}”. O estado do item não foi alterado.`));
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
      {note.status !== "pendente_transcricao" && (
        <div className="mt-2">
          <Textarea disabled={readOnly || note.status === "descartado"} aria-label="Texto aprovado do relato" rows={3} value={approved} onChange={(e) => setApproved(e.target.value)} />
          {!readOnly && (
            <div className="mt-2 flex gap-2">
              <button type="button" className="min-h-11 flex-1 rounded-xl border border-input text-xs font-semibold" onClick={() => void saver.run(() => upd({ data: { id: note.id, expectedRevision: note.revision, patch: { status: "descartado" } } }), (f, row) => ({ ...f, notes: replaceRow(f.notes, row) }))}>
                Descartar
              </button>
              <button type="button" disabled={!approved.trim()} className="min-h-11 flex-1 rounded-xl bg-primary text-xs font-semibold text-primary-foreground disabled:opacity-40" onClick={() => void saver.run(() => upd({ data: { id: note.id, expectedRevision: note.revision, patch: { status: "revisado", approved_text: approved.trim() } } }), (f, row) => ({ ...f, notes: replaceRow(f.notes, row) }))}>
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

function DataTab({ data, readOnly, saver }: { data: InspectionFull; readOnly: boolean; saver: Saver }) {
  const i = data.inspection;
  const upd = useServerFn(updateInspectionBasics);
  const toLocal = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const [form, setForm] = useState(() => ({
    kind: i.kind as InspectionKind,
    when: toLocal(i.inspected_at),
    furnished: i.furnished,
    cleaning: i.cleaning,
    meters: { ...emptyMeters(), ...(i.meters as Partial<Meters>) } as Meters,
    general_notes: i.general_notes ?? "",
    conclusion: i.conclusion ?? "",
    plan_confirmed: Boolean(i.plan_confirmed),
    participants: (i.participants ?? []) as Array<{ nome: string; papel: string }>,
    keys: (i.keys ?? []) as Array<{ descricao: string; quantidade: number }>,
  }));
  const f = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
  const cad = i.property_snapshot?.cadastro ?? {};
  const conf = i.property_snapshot?.confirmado ?? {};
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void saver
          .run(
            () =>
              upd({
                data: {
                  id: i.id,
                  expectedRevision: i.revision,
                  patch: {
                    kind: form.kind,
                    inspected_at: form.when ? new Date(form.when).toISOString() : null,
                    furnished: form.furnished,
                    cleaning: form.cleaning,
                    meters: form.meters,
                    general_notes: form.general_notes.trim() || null,
                    conclusion: form.conclusion.trim() || null,
                    plan_confirmed: form.plan_confirmed,
                    participants: form.participants.filter((p) => p.nome.trim()),
                    keys: form.keys.filter((k) => k.descricao.trim()),
                  },
                },
              }),
            (full, row) => ({ ...full, inspection: row }),
          )
          .then(() => toast.success("Dados salvos."))
          .catch(() => undefined);
      }}
    >
      <section className="premium-card space-y-1 rounded-2xl p-4 text-sm">
        <h2 className="font-semibold">Identificação (registrada na criação)</h2>
        <p>{[cad.codigo_cordial && `Cordial ${cad.codigo_cordial}`, cad.codigo_morar && `Morar ${cad.codigo_morar}`].filter(Boolean).join(" · ")}</p>
        <p className="text-foreground/65">{i.property_snapshot?.endereco}</p>
        <p className="text-foreground/65">Tipo {conf.tipo ?? cad.tipo ?? "—"} · {conf.dormitorios ?? "—"} dorm. ({conf.suites ?? 0} suítes) · {conf.banheiros ?? "—"} banh. · {conf.vagas ?? "—"} vagas</p>
        <p className="text-foreground/65">Responsável: {i.responsible_name ?? "—"}</p>
      </section>
      <fieldset disabled={readOnly} className="premium-card space-y-3 rounded-2xl p-4">
        <label className="block"><span className="mb-1 block text-xs font-semibold text-foreground/60">Tipo</span>
          <select className={f} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as InspectionKind })}>
            {INSPECTION_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-foreground/60">Data e hora</span>
          <Input type="datetime-local" className="h-11" value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label><span className="mb-1 block text-xs font-semibold text-foreground/60">Mobiliado</span>
            <select className={f} value={form.furnished} onChange={(e) => setForm({ ...form, furnished: e.target.value })}>
              <option value="nao_informado">Não informado</option><option value="nao">Não</option><option value="semimobiliado">Semimobiliado</option><option value="mobiliado">Mobiliado</option>
            </select>
          </label>
          <label><span className="mb-1 block text-xs font-semibold text-foreground/60">Limpeza</span>
            <select className={f} value={form.cleaning} onChange={(e) => setForm({ ...form, cleaning: e.target.value })}>
              <option value="nao_informado">Não informado</option><option value="limpo">Limpo</option><option value="parcial">Parcial</option><option value="sujo">Sujo</option><option value="nao_se_aplica">Não se aplica</option>
            </select>
          </label>
        </div>
        {(Object.keys(METER_LABEL) as Array<keyof Meters>).map((k) => (
          <div key={k} className="grid grid-cols-[4rem_1fr] items-center gap-2">
            <span className="text-sm font-medium">{METER_LABEL[k]}</span>
            <select aria-label={`Situação de ${METER_LABEL[k]}`} className={f} value={form.meters[k].status} onChange={(e) => setForm({ ...form, meters: { ...form.meters, [k]: { ...form.meters[k], status: e.target.value as MeterStatus } } })}>
              {(Object.keys(METER_STATUS_LABEL) as MeterStatus[]).map((s) => <option key={s} value={s}>{METER_STATUS_LABEL[s]}</option>)}
            </select>
            {form.meters[k].status === "informado" && (
              <Input aria-label={`Leitura de ${METER_LABEL[k]}`} className="col-span-2 h-11" placeholder="Leitura" value={form.meters[k].reading ?? ""} onChange={(e) => setForm({ ...form, meters: { ...form.meters, [k]: { ...form.meters[k], reading: e.target.value } } })} />
            )}
          </div>
        ))}
        <div>
          <span className="mb-1 block text-xs font-semibold text-foreground/60">Participantes</span>
          {form.participants.map((p, idx) => (
            <div key={idx} className="mb-2 flex gap-2">
              <Input aria-label="Nome" className="h-11" value={p.nome} onChange={(e) => setForm({ ...form, participants: form.participants.map((x, j) => (j === idx ? { ...x, nome: e.target.value } : x)) })} />
              <Input aria-label="Papel" className="h-11" value={p.papel} onChange={(e) => setForm({ ...form, participants: form.participants.map((x, j) => (j === idx ? { ...x, papel: e.target.value } : x)) })} />
              <button type="button" aria-label="Remover" className="grid size-11 shrink-0 place-items-center" onClick={() => setForm({ ...form, participants: form.participants.filter((_, j) => j !== idx) })}><X className="size-4" /></button>
            </div>
          ))}
          <button type="button" className="min-h-11 text-sm font-medium text-primary" onClick={() => setForm({ ...form, participants: [...form.participants, { nome: "", papel: "" }] })}>+ Participante</button>
        </div>
        <div>
          <span className="mb-1 block text-xs font-semibold text-foreground/60">Chaves e controles</span>
          {form.keys.map((k, idx) => (
            <div key={idx} className="mb-2 flex gap-2">
              <Input aria-label="Quantidade" type="number" min={0} className="h-11 w-20" value={k.quantidade} onChange={(e) => setForm({ ...form, keys: form.keys.map((x, j) => (j === idx ? { ...x, quantidade: Number(e.target.value) || 0 } : x)) })} />
              <Input aria-label="Descrição" className="h-11" value={k.descricao} onChange={(e) => setForm({ ...form, keys: form.keys.map((x, j) => (j === idx ? { ...x, descricao: e.target.value } : x)) })} />
              <button type="button" aria-label="Remover" className="grid size-11 shrink-0 place-items-center" onClick={() => setForm({ ...form, keys: form.keys.filter((_, j) => j !== idx) })}><X className="size-4" /></button>
            </div>
          ))}
          <button type="button" className="min-h-11 text-sm font-medium text-primary" onClick={() => setForm({ ...form, keys: [...form.keys, { descricao: "", quantidade: 1 }] })}>+ Chave/controle</button>
        </div>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-foreground/60">Observações gerais</span>
          <Textarea rows={3} value={form.general_notes} onChange={(e) => setForm({ ...form, general_notes: e.target.value })} />
        </label>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-foreground/60">Conclusão do laudo</span>
          <Textarea rows={3} value={form.conclusion} onChange={(e) => setForm({ ...form, conclusion: e.target.value })} />
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="size-5" checked={form.plan_confirmed} onChange={(e) => setForm({ ...form, plan_confirmed: e.target.checked })} />
          Planta (lista de ambientes) confirmada
        </label>
        <button type="submit" className="min-h-12 w-full rounded-2xl bg-primary text-sm font-semibold text-primary-foreground">Salvar dados</button>
      </fieldset>
    </form>
  );
}

/* ============================ Revisão ============================ */

function ReviewTab({ data, pending, saver, onJump, refetch }: { data: InspectionFull; pending: PendingEntry[]; saver: Saver; onJump: (roomId: string, itemId?: string) => void; refetch: () => void }) {
  const i = data.inspection;
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
        basics: { inspected_at: i.inspected_at, responsible_id: i.responsible_id, plan_confirmed: i.plan_confirmed },
        rooms: data.rooms,
        items: data.items,
        media: data.media,
        notes: data.notes,
        localPending: pending.map((p) => ({ room_id: p.roomId, kind: p.kind, status: p.status })),
      }),
    [data, i, pending],
  );

  async function build(draft: boolean) {
    const [{ buildInspectionPdf, PdfPhotoError }] = await Promise.all([import("@/lib/vistoria/pdf")]);
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
      if (e instanceof PdfPhotoError) setPhotoErrors(e.failed.map((f) => `Foto ${f.number} (${f.room}): ${f.reason}`));
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
      const { bytes, model } = await build(false);
      const sha = await sha256Hex(bytes);
      const version = i.current_version + 1;
      const path = documentPath(i.id, version).replace(/\.pdf$/, `-${sha.slice(0, 16)}.pdf`);
      const up = await supabase.storage.from(BUCKET).upload(path, new Blob([bytes as BlobPart], { type: "application/pdf" }), { contentType: "application/pdf", upsert: false });
      if (up.error && !/exists|duplicate/i.test(up.error.message)) throw new Error(up.error.message);
      await saver.run(() => finalize({ data: { id: i.id, expectedRevision: i.revision, storagePath: path, byteSize: bytes.byteLength, sha256: sha, snapshot: model as unknown as Record<string, unknown> } }));
      toast.success(`Laudo v${version} emitido.`);
      refetch();
      await deliverPdf(bytes, `vistoria-${i.numero}-v${version}.pdf`);
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
          <h2 className="text-sm font-semibold">{issues.length ? `${issues.length} pendência(s) antes de concluir` : "Tudo pronto para concluir"}</h2>
          <ul className="mt-2 max-h-[50dvh] space-y-1 overflow-y-auto">
            {issues.map((iss, k) => (
              <li key={k}>
                <button type="button" disabled={!iss.roomId} onClick={() => iss.roomId && onJump(iss.roomId, iss.itemId)} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left text-sm hover:bg-foreground/5 disabled:cursor-default">
                  <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                  <span>{iss.message}</span>
                </button>
              </li>
            ))}
          </ul>
          {i.status !== "em_revisao" && (
            <button type="button" className="mt-2 min-h-11 text-sm font-semibold text-primary" onClick={() => void saver.run(() => upd({ data: { id: i.id, expectedRevision: i.revision, patch: { status: "em_revisao" } } }), (f, row) => ({ ...f, inspection: row }))}>
              Marcar como em revisão
            </button>
          )}
        </section>
      )}
      {photoErrors.length > 0 && (
        <section className="rounded-2xl border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
          <p className="font-semibold text-destructive">Fotos que não carregaram — o laudo final não foi emitido:</p>
          <ul className="mt-1 list-disc pl-5">{photoErrors.map((e) => <li key={e}>{e}</li>)}</ul>
          <p className="mt-1 text-xs">Verifique a conexão e tente novamente.</p>
        </section>
      )}
      <section className="grid gap-2">
        <button type="button" disabled={busy !== null} onClick={() => void downloadDraft()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-input text-sm font-semibold disabled:opacity-50">
          {busy === "draft" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} Baixar PDF de rascunho
        </button>
        {!concluded && (
          <button type="button" disabled={busy !== null || issues.length > 0} onClick={() => void conclude()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 disabled:opacity-45">
            {busy === "final" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Concluir e emitir laudo v{i.current_version + 1}
          </button>
        )}
      </section>
      {data.documents.length > 0 && (
        <section className="premium-card rounded-2xl p-4">
          <h2 className="mb-2 text-sm font-semibold">Laudos emitidos</h2>
          <ul className="space-y-1">
            {data.documents.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => void downloadVersion(d.version)} className="flex min-h-11 w-full items-center justify-between rounded-xl px-2 text-sm hover:bg-foreground/5">
                  <span>Versão {d.version} · {fmt(d.created_at)}</span>
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
          <p className="text-xs text-foreground/60">Reabrir coloca a vistoria em revisão. O laudo já emitido continua guardado; a conclusão gera uma nova versão.</p>
          <Input aria-label="Motivo da reabertura" placeholder="Motivo" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} className="h-11" />
          <button type="button" disabled={reopenReason.trim().length < 3} onClick={() => void saver.run(() => reopen({ data: { id: i.id, expectedRevision: i.revision, reason: reopenReason.trim() } })).then(() => { setReopenReason(""); refetch(); })} className="min-h-11 w-full rounded-xl border border-input text-sm font-semibold disabled:opacity-40">
            Reabrir para revisão
          </button>
        </section>
      )}
      <section className="premium-card rounded-2xl p-4">
        <h2 className="mb-2 text-sm font-semibold">Histórico</h2>
        <ul className="space-y-1 text-xs text-foreground/70">
          {data.events.map((e) => (
            <li key={e.id}>{fmt(e.created_at)} · {eventLabel(e)}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function eventLabel(e: any) {
  const d = e.details ?? {};
  switch (e.event) {
    case "criada": return `Vistoria criada (${d.rooms ?? 0} ambientes)`;
    case "status": return `Status: ${STATUS_LABEL[d.status as InspectionStatus] ?? d.status}`;
    case "concluida": return `Concluída · laudo v${d.version}`;
    case "reaberta": return `Reaberta: ${d.motivo ?? ""}`;
    case "ambiente_adicionado": return `Ambiente adicionado: ${d.name ?? ""}`;
    case "ambiente_removido": return "Ambiente removido";
    case "foto_excluida": return "Foto excluída";
    default: return e.event;
  }
}
