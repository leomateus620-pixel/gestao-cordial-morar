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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/auth-mock";
import { cn } from "@/lib/utils";
import { DraftStatus, useDraftRow, useDrafts } from "@/lib/vistoria/drafts";
import { discardRoomPending, newClientKey, type PendingEntry } from "@/lib/vistoria/local-store";
import { prepareImage, startRecorder, type Recorder } from "@/lib/vistoria/media-client";
import { canKeepOriginal, TOO_BIG_MESSAGE } from "@/lib/vistoria/image-prepare";
import {
  armCaptureMarker,
  clearCaptureMarker,
  readResumeMarker,
  RESUME_MESSAGE,
  type CaptureMarker,
  type CaptureOrigin,
} from "@/lib/vistoria/capture-resume";
import { checkDeviceStorage, LOW_MESSAGE } from "@/lib/vistoria/storage-persist";
import { CAMERA_FAILED, InAppCamera, supportsInAppCamera } from "./in-app-camera";
import {
  itemResolved,
  KIND_LABEL,
  progress,
  STATUS_LABEL,
  type InspectionKind,
  type InspectionStatus,
  type RoomKind,
  type VoiceContext,
} from "@/lib/vistoria/model";
import { STATUS_TONE } from "@/lib/vistoria/ui";
import { useFieldViewport } from "@/lib/vistoria/use-field-viewport";
import {
  inspectionKey,
  replaceRow,
  useInspection,
  useLocalQueue,
  useSaver,
} from "@/lib/vistoria/use-inspection";
import {
  addItem,
  addRoom,
  deleteRoom,
  reorderRooms,
  updateInspectionBasics,
  updateRoom,
  type InspectionFull,
} from "@/lib/vistoria/vistoria.functions";
import { getVoiceStatus } from "@/lib/vistoria/voice.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CloudOff,
  Folder,
  Keyboard,
  Loader2,
  Mic,
  Pencil,
  Plus,
  Square,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { fmtInspectionTime as fmt } from "@/lib/vistoria/ui";
import { DataTab } from "./inspection-data";
import { ReviewTab } from "./inspection-review";
import { ItemCard, NoPhotoReason } from "./item-editor";
import { NotesBlock } from "./notes-editor";
import { useTranscriptionRunner } from "@/lib/vistoria/use-inspection";
import type { NoteRow } from "@/lib/vistoria/types";
type Runner = ReturnType<typeof useTranscriptionRunner>;
import { PhotosBlock } from "./photos";
type Saver = ReturnType<typeof useSaver>;
type Queue = ReturnType<typeof useLocalQueue>;
type Tab = "ambientes" | "dados" | "revisao";
export function VistoriaWorkspace({
  vistoriaId,
  returnToRentalForm = false,
}: {
  vistoriaId: string;
  returnToRentalForm?: boolean;
}) {
  useFieldViewport();
  const session = useSession();
  const qc = useQueryClient();
  const drafts = useDrafts();
  const full = useInspection(vistoriaId);
  const voiceFn = useServerFn(getVoiceStatus);
  const voice = useQuery({
    queryKey: ["vistoria-voice-status", session?.id],
    queryFn: () => voiceFn(),
    staleTime: 60_000,
  });
  const voiceReady = Boolean(voice.data?.transcribe.ready);
  const voiceAdmin = Boolean(voice.data?.isAdmin);
  const queue = useLocalQueue(session?.id, vistoriaId);
  const runner = useTranscriptionRunner(
    session?.id,
    vistoriaId,
    full.data?.notes,
    voiceReady,
    full.data?.inspection.status === "concluida",
  );
  const saver = useSaver(vistoriaId);
  const [tab, setTab] = useState<Tab>("ambientes");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [jump, setJump] = useState<{ kind: string; itemId?: string } | null>(null);

  const data = full.data;
  const firstLoad = useRef(true);
  useEffect(() => {
    if (data && firstLoad.current) {
      firstLoad.current = false;
      if (data.inspection.status === "concluida") setTab("revisao");
    }
  }, [data]);
  useEffect(() => {
    if (!data?.rooms.length) return;
    const saved = sessionStorage.getItem(`vistoria:${session?.id}:${vistoriaId}:room`);
    setRoomId((cur) => {
      if (cur && data.rooms.some((r) => r.id === cur)) return cur;
      if (saved && data.rooms.some((r) => r.id === saved)) return saved;
      return data.rooms[0].id;
    });
  }, [data?.rooms, vistoriaId, session?.id]);
  useEffect(() => {
    if (roomId) sessionStorage.setItem(`vistoria:${session?.id}:${vistoriaId}:room`, roomId);
  }, [roomId, vistoriaId, session?.id]);

  if (full.isLoading)
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="size-6 animate-spin text-foreground/50" />
      </div>
    );
  if (full.error || !data)
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <p className="font-semibold">Não foi possível abrir a vistoria</p>
        <p className="mt-1 text-sm text-foreground/60">{(full.error as Error)?.message}</p>
        <Link
          to="/vistorias"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
        >
          Voltar
        </Link>
      </div>
    );

  const insp = data.inspection;
  const readOnly = insp.status === "concluida";
  const prog = progress(data.rooms, data.items);
  const snap = insp.property_snapshot ?? {};
  const rental = Boolean(insp.rental_contract_id);

  return (
    <div
      className={cn(
        "inspection-workspace mx-auto w-full pb-40",
        rental ? "max-w-4xl" : "max-w-2xl",
      )}
    >
      <header className="sticky top-0 z-20 -mx-4 mb-3 border-b border-border/50 bg-background px-4 pb-2 pt-2 backdrop-blur">
        <div className="flex items-center gap-2">
          {insp.rental_contract_id ? (
            <Link
              to="/alugueis"
              aria-label="Voltar ao aluguel"
              search={
                returnToRentalForm
                  ? { formulario: insp.rental_contract_id, etapa: "vistorias" }
                  : { id: insp.rental_contract_id, etapa: "vistorias" }
              }
              className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-foreground/5"
            >
              <ArrowLeft className="size-5" />
            </Link>
          ) : (
            <Link
              to="/vistorias"
              aria-label="Voltar às vistorias"
              className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-foreground/5"
            >
              <ArrowLeft className="size-5" />
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">
              Nº {insp.numero} · {KIND_LABEL[insp.kind as InspectionKind]}
            </p>
            <p className="truncate text-xs text-foreground/60">{snap.endereco}</p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
              STATUS_TONE[insp.status as InspectionStatus],
            )}
          >
            {STATUS_LABEL[insp.status as InspectionStatus]}
          </span>
        </div>
        <p className="ml-11 text-xs font-medium text-primary">
          {tab === "ambientes"
            ? rental
              ? `${data.rooms.length} ${data.rooms.length === 1 ? "cômodo" : "cômodos"}`
              : `${data.rooms.find((r) => r.id === roomId)?.name ?? "Ambientes"} · ambiente ${data.rooms.findIndex((r) => r.id === roomId) + 1} de ${data.rooms.length}`
            : tab === "dados"
              ? "Dados da vistoria"
              : rental
                ? "Revisão e termo"
                : "Revisão e laudos"}
        </p>
        {data.cacheMode && (
          <p role="status" className="text-xs text-amber-800">
            Sem conexão · mostrando a última consulta salva no aparelho.
          </p>
        )}
        {!rental && (
          <div
            className="mt-2 flex items-center gap-2 text-[11px] text-foreground/60"
            aria-live="polite"
          >
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10"
              role="progressbar"
              aria-valuenow={prog.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progresso dos itens"
            >
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${prog.percent}%` }}
              />
            </div>
            <span className="tabular-nums">
              {prog.done}/{prog.total} preenchidos · {prog.roomsDone}/{prog.rooms} amb.
            </span>
          </div>
        )}
        {drafts.pending.length ? (
          <DraftStatus />
        ) : (
          <SaveIndicator state={saver.state} pending={queue.pending} serverTime={data.serverTime} />
        )}
        {queue.error && (
          <p role="alert" className="text-sm text-destructive">
            {queue.error}
          </p>
        )}
        {queue.unpersisted.map((p) => (
          <div key={p.key} role="alert" className="text-sm text-destructive">
            {p.error}. Não feche a tela.
            <button
              type="button"
              className="min-h-11 underline"
              onClick={() => void queue.retryLocal(p.key)}
            >
              Tentar salvar no aparelho
            </button>
          </div>
        ))}
        <nav
          className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-foreground/5 p-1"
          aria-label="Seções da vistoria"
        >
          {(["ambientes", "dados", "revisao"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "min-h-11 rounded-lg text-sm font-semibold",
                tab === t ? "bg-background shadow-sm" : "text-foreground/60",
              )}
            >
              {
                { ambientes: rental ? "Cômodos" : "Ambientes", dados: "Dados", revisao: "Revisão" }[
                  t
                ]
              }
            </button>
          ))}
        </nav>
      </header>

      <div hidden={tab !== "ambientes"}>
        <RoomsTab
          active={tab === "ambientes"}
          data={data}
          roomId={roomId}
          setRoomId={setRoomId}
          readOnly={readOnly}
          saver={saver}
          queue={queue}
          userId={session?.id}
          voiceReady={voiceReady}
          voiceAdmin={voiceAdmin}
          runner={runner}
          onReview={() => setTab("revisao")}
          jump={jump}
        />
      </div>
      {tab === "dados" && <DataTab data={data} readOnly={readOnly} saver={saver} />}
      {tab === "revisao" && (
        <ReviewTab
          data={data}
          pending={queue.pending}
          queueBlocked={
            Boolean(queue.error) || queue.unpersisted.length > 0 || Boolean(data.cacheMode)
          }
          saver={saver}
          onJump={(rid, itemId, kind) => {
            if (!rid) {
              if (kind === "sem_ambientes") {
                setJump({ kind });
                setTab("ambientes");
              } else setTab("dados");
              return;
            }
            setJump({ kind: kind ?? "item_pendente", itemId });
            setTab("ambientes");
            setRoomId(rid);
            if (itemId)
              setTimeout(
                () =>
                  document
                    .getElementById(`item-${itemId}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" }),
                120,
              );
          }}
          refetch={() => qc.invalidateQueries({ queryKey: inspectionKey(vistoriaId, session?.id) })}
        />
      )}
    </div>
  );
}

function SaveIndicator({
  state,
  pending,
  serverTime,
}: {
  state: ReturnType<typeof useSaver>["state"];
  pending: PendingEntry[];
  serverTime: string;
}) {
  const local = pending.length;
  const errors = pending.filter((p) => p.status === "erro").length;
  const photosWaiting = pending.filter((p) => p.kind === "photo").length;
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px]" aria-live="polite">
      {state.kind === "saving" && (
        <span className="text-foreground/60">
          <Loader2 className="mr-1 inline size-3 animate-spin" />
          Salvando…
        </span>
      )}
      {state.kind === "saved" && (
        <span className="text-emerald-700">
          <Check className="mr-1 inline size-3" />
          Salvo no servidor às {fmt(state.at)}
        </span>
      )}
      {state.kind === "idle" && (
        <span className="text-foreground/55">Sincronizado às {fmt(serverTime)}</span>
      )}
      {state.kind === "error" && (
        <span className="text-destructive">
          <AlertTriangle className="mr-1 inline size-3" />
          {state.message}
        </span>
      )}
      {state.kind === "conflict" && (
        <span className="text-amber-700">
          <AlertTriangle className="mr-1 inline size-3" />
          {state.message}
        </span>
      )}
      {local > 0 && (
        <span className={errors ? "text-destructive" : "text-amber-700"}>
          <CloudOff className="mr-1 inline size-3" />
          {photosWaiting > 0
            ? `${photosWaiting} ${photosWaiting === 1 ? "foto aguardando" : "fotos aguardando"} envio`
            : `${local} arquivo(s) aguardando envio`}
          {" · Salvo no aparelho"}
          {offline ? " · Sem internet: as fotos serão enviadas quando a conexão voltar" : ""}
          {errors ? ` · ${errors} com erro` : ""}
        </span>
      )}
    </p>
  );
}

/* ============================ Ambientes ============================ */

function RoomsTab(props: {
  data: InspectionFull;
  active: boolean;
  roomId: string | null;
  setRoomId: (id: string) => void;
  readOnly: boolean;
  saver: Saver;
  queue: Queue;
  userId?: string;
  voiceReady: boolean;
  voiceAdmin: boolean;
  runner: Runner;
  onReview: () => void;
  jump: { kind: string; itemId?: string } | null;
}) {
  const { data, roomId, setRoomId, readOnly, saver, queue } = props;
  const drafts = useDrafts();
  const queryClient = useQueryClient();
  const [area, setArea] = useState<"itens" | "fotos" | "relatos">("itens");
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [evidenceItem, setEvidenceItem] = useState<string | null>(null);
  const insp = data.inspection;
  const rental = Boolean(insp.rental_contract_id);
  const addingRequest = useRef(false);
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
  const [camOpen, setCamOpen] = useState(false);
  const [resume, setResume] = useState<CaptureMarker | null>(null);
  const [storageLow, setStorageLow] = useState(false);
  const itemKey = `vistoria:${props.userId}:${insp.id}:item`;
  const safeStore = () => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  };
  // Marcador de retomada e aviso de espaço: só na primeira montagem.
  useEffect(() => {
    if (!props.userId) return;
    const store = safeStore();
    const m = store ? readResumeMarker(store, props.userId, insp.id) : null;
    if (m) {
      setResume(m);
      if (data.rooms.some((r) => r.id === m.roomId)) setRoomId(m.roomId);
    }
    void checkDeviceStorage(navigator.storage, store ?? undefined).then(setStorageLow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.userId, insp.id]);
  function armMarker(origin: CaptureOrigin, itemId: string | null) {
    const store = safeStore();
    if (!store || !props.userId || !room) return;
    armCaptureMarker(store, { userId: props.userId, inspectionId: insp.id, roomId: room.id, itemId, origin });
  }
  function clearMarker() {
    const store = safeStore();
    if (store && props.userId) clearCaptureMarker(store, props.userId, insp.id);
  }
  // Câmera nativa cancelada sem recarregar: o foco volta à página → apaga em silêncio.
  useEffect(() => {
    const back = () => window.setTimeout(clearMarker, 1500);
    window.addEventListener("focus", back);
    return () => window.removeEventListener("focus", back);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.userId, insp.id]);
  function openNative(itemId: string | null) {
    armMarker("camera", itemId);
    camRef.current?.click();
  }
  function openGallery(itemId: string | null) {
    setEvidenceItem(itemId);
    armMarker("galeria", itemId);
    galRef.current?.click();
  }
  function openCamera(itemId: string | null) {
    setEvidenceItem(itemId);
    if (supportsInAppCamera()) setCamOpen(true);
    else openNative(itemId);
  }
  useEffect(() => {
    if (!props.jump) return;
    setArea(
      props.jump.kind === "relato_pendente"
        ? "relatos"
        : ["ambiente_sem_foto", "midia_pendente"].includes(props.jump.kind)
          ? "fotos"
          : "itens",
    );
    if (props.jump.kind === "sem_ambientes") setAdding({ name: "", kind: "outro" });
    if (props.jump.kind === "relato_pendente") {
      setEvidenceItem(props.jump.itemId ?? null);
      setMode("texto");
    }
  }, [props.jump]);
  const furnished = insp.furnished === "mobiliado" || insp.furnished === "semimobiliado";

  const markStarted = useCallback(async () => {
    if (insp.status !== "rascunho") return;
    try {
      await saver.run(
        () =>
          updInsp({
            data: {
              id: insp.id,
              expectedRevision: insp.revision,
              patch: { status: "em_andamento" },
            },
          }),
        (f, row) => ({ ...f, inspection: row }),
      );
    } catch {
      /* indicador já mostra */
    }
  }, [insp.id, insp.revision, insp.status, saver, updInsp]);

  /* ---------- Voz ---------- */
  const recRef = useRef<{
    rec: Recorder;
    ctx: VoiceContext;
    startedAt: number;
    timer: number;
  } | null>(null);
  const [recording, setRecording] = useState<{ startedAt: number; roomName: string } | null>(null);
  const [level, setLevel] = useState(0);
  const currentCtx = useRef<VoiceContext | null>(null);
  const sessionId = useRef(newClientKey());
  currentCtx.current = room
    ? { inspectionId: insp.id, roomId: room.id, sessionId: sessionId.current }
    : null;

  const saveSegment = useCallback(
    async (rec: Recorder, ctx: VoiceContext) => {
      try {
        const { blob, seconds } = await rec.stop();
        if (!props.userId) return;
        await queue.stage({
          userId: props.userId,
          inspectionId: ctx.inspectionId,
          roomId: ctx.roomId,
          itemId: ctx.itemId ?? null,
          clientKey: newClientKey(),
          kind: "audio",
          blob,
          mime: "audio/wav",
          seconds,
          replacesNoteId: ctx.replacesNoteId ?? null,
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

  const startRecording = useCallback(async (replaces?: NoteRow) => {
    if (!room || recRef.current) return;
    const ctx: VoiceContext = {
      inspectionId: insp.id,
      roomId: room.id,
      sessionId: sessionId.current,
      itemId: replaces ? replaces.item_id : evidenceItem,
      replacesNoteId: replaces?.id ?? null,
    };
    try {
      const rec = await startRecorder(() => {
        toast.warning("Gravação interrompida pelo sistema. O trecho gravado foi salvo.");
        void stopRecording();
      });
      if (currentCtx.current?.roomId !== ctx.roomId) {
        rec.cancel();
        return;
      }
      const startedAt = Date.now();
      let segmenting = false;
      const timer = window.setInterval(async () => {
        const cur = recRef.current;
        if (!cur) return;
        setLevel(cur.rec.level());
        // Segmenta a cada 60 s: cada trecho é um WAV completo salvo localmente.
        if (Date.now() - cur.startedAt > 60_000 && !segmenting) {
          segmenting = true;
          const next = await startRecorder().catch(() => null);
          if (recRef.current !== cur) {
            next?.cancel();
            segmenting = false;
            return;
          }
          const old = cur.rec;
          if (next) {
            recRef.current = { ...cur, rec: next, startedAt: Date.now() };
          } else {
            recRef.current = null;
            window.clearInterval(cur.timer);
            setRecording(null);
          }
          await saveSegment(old, cur.ctx);
          segmenting = false;
        }
      }, 250);
      recRef.current = { rec, ctx, startedAt, timer };
      setRecording({
        startedAt,
        roomName: [room.name, data.items.find((i) => i.id === evidenceItem)?.name]
          .filter(Boolean)
          .join(" · "),
      });
      void markStarted();
    } catch (e) {
      const name = (e as { name?: string })?.name;
      toast.error(
        name === "NotAllowedError"
          ? "Permissão do microfone negada. Libere o microfone nas configurações do navegador."
          : name === "NotFoundError"
            ? "Nenhum microfone encontrado."
            : e instanceof Error
              ? e.message
              : "Não foi possível gravar.",
      );
    }
  }, [room, insp.id, stopRecording, saveSegment, markStarted, evidenceItem, data.items]);

  const stopRef = useRef(stopRecording);
  stopRef.current = stopRecording;
  useBlocker({
    shouldBlockFn: async () => {
      if (recRef.current) await stopRef.current();
      return queue.hasUnpersisted();
    },
    enableBeforeUnload: () => Boolean(recRef.current) || queue.hasUnpersisted(),
  });
  useEffect(() => {
    if (!props.active && recRef.current) void stopRef.current();
  }, [props.active]);
  // Only a real room/context change ends a recording, never a callback rerender.
  useEffect(() => {
    return () => {
      if (recRef.current) void stopRef.current();
    };
  }, [roomId, insp.id, props.userId]);
  useEffect(() => {
    setEvidenceItem(null);
    setMode("none");
  }, [roomId]);
  // Depois do reset acima: volta ao item guardado (retomada ou mesmo cômodo).
  useEffect(() => {
    if (!roomId) return;
    if (resume && resume.roomId === roomId) {
      setEvidenceItem(resume.itemId);
      return;
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem(itemKey) || "null") as {
        roomId: string;
        itemId: string | null;
      } | null;
      if (saved?.roomId === roomId && data.items.some((i) => i.id === saved.itemId))
        setEvidenceItem(saved.itemId);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, resume]);
  useEffect(() => {
    if (!roomId) return;
    try {
      sessionStorage.setItem(itemKey, JSON.stringify({ roomId, itemId: evidenceItem }));
    } catch {
      /* ignore */
    }
  }, [roomId, evidenceItem, itemKey]);

  /* ---------- Fotos ---------- */
  // Uma foto por vez: prepara reduzida (com miniatura) e só então guarda na fila.
  async function stagePhoto(
    file: Blob & { name?: string },
    source: "captura" | "importacao",
    ctxRoom: string,
    ctxItem: string | null,
  ) {
    if (!props.userId) return false;
    const base = {
      userId: props.userId,
      inspectionId: insp.id,
      roomId: ctxRoom,
      itemId: ctxItem,
      clientKey: newClientKey(),
      kind: "photo" as const,
      takenAt: new Date().toISOString(),
      timeSource: source,
      status: "local" as const,
      attempts: 0,
      createdAt: new Date().toISOString(),
    };
    try {
      const { blob, width, height, thumb } = await prepareImage(file);
      return queue.stage({ ...base, blob, thumb, mime: "image/jpeg", width, height });
    } catch {
      // Original só se for JPEG/PNG de até 15 MB; senão, aviso amigável.
      if (canKeepOriginal(file)) return queue.stage({ ...base, blob: file, mime: file.type });
      toast.error(`${file.name ? `${file.name}: ` : ""}${TOO_BIG_MESSAGE}`);
      return false;
    }
  }
  async function afterStaged(ok: number) {
    if (!ok) return;
    clearMarker();
    setResume(null);
    void markStarted();
    await queue.refresh();
    void queue.process();
  }
  async function onFiles(files: FileList | null, source: "captura" | "importacao") {
    if (!files?.length || !room || !props.userId) return;
    const ctxRoom = room.id;
    const ctxItem = evidenceItem;
    let ok = 0;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name}: não é uma imagem.`);
        continue;
      }
      if (await stagePhoto(file, source, ctxRoom, ctxItem)) ok++;
    }
    await afterStaged(ok);
  }
  async function onCameraShot(blob: Blob) {
    if (!room) return;
    const ok = await stagePhoto(blob, "captura", room.id, evidenceItem);
    if (!ok) throw new Error("não salvo");
    await afterStaged(1);
  }

  if (!data.rooms.length && readOnly)
    return <p className="text-sm text-foreground/60">Sem ambientes.</p>;

  const roomItems = room ? data.items.filter((i) => i.room_id === room.id) : [];
  const roomMedia = room ? data.media.filter((m) => m.room_id === room.id) : [];
  const roomNotes = room ? data.notes.filter((n) => n.room_id === room.id) : [];
  const roomPending = room ? queue.pending.filter((p) => p.roomId === room.id) : [];

  const roomPhotoCount =
    roomMedia.length + roomPending.filter((p) => p.kind === "photo").length;

  return (
    <div>
      {resume && (
        <div
          role="alert"
          className="mb-3 flex flex-wrap items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p className="min-w-0 flex-1">{RESUME_MESSAGE}</p>
          <button
            type="button"
            className="min-h-11 rounded-lg border border-amber-400 px-3 font-semibold"
            onClick={() => {
              clearMarker();
              setResume(null);
            }}
          >
            Entendi
          </button>
        </div>
      )}
      {storageLow && (
        <p role="alert" className="mb-3 rounded-xl border border-destructive/40 p-3 text-sm text-destructive">
          {LOW_MESSAGE}
        </p>
      )}
      {!rental && (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {room?.name ?? "Ambientes"} · ambiente {idx + 1} de {data.rooms.length}
            </p>
            <button
              type="button"
              className="min-h-11 rounded-xl border px-3 text-sm font-semibold text-primary"
              onClick={() => setRoomsOpen(true)}
            >
              Ver ambientes
            </button>
          </div>
          <Dialog open={roomsOpen} onOpenChange={setRoomsOpen}>
            <DialogContent className="inspection-workspace max-h-[85dvh] overflow-auto">
              <DialogTitle>Ambientes do imóvel</DialogTitle>
              <p className="text-sm text-foreground/60">
                Avance na coleta mesmo com itens pendentes.
              </p>
              <ul className="space-y-2">
                {data.rooms.map((r, index) => {
                  const own = data.items.filter((it) => it.room_id === r.id);
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        className="min-h-14 w-full rounded-xl border p-3 text-left"
                        onClick={() => {
                          setRoomId(r.id);
                          setRoomsOpen(false);
                          setArea("itens");
                        }}
                      >
                        <strong>
                          {index + 1}. {r.name}
                        </strong>
                        <span className="mt-1 block text-sm text-foreground/60">
                          {own.filter((it) => !itemResolved(it)).length} itens pendentes ·{" "}
                          {data.media.filter((m) => m.room_id === r.id).length} fotos
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </DialogContent>
          </Dialog>
        </>
      )}
      <div
        className={
          rental
            ? "mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
            : "-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1"
        }
        aria-label={rental ? "Cômodos do imóvel" : "Atalhos de ambientes"}
      >
        {data.rooms.map((r) => {
          const photoCount = data.media.filter((m) => m.room_id === r.id).length;
          const its = data.items.filter((i) => i.room_id === r.id);
          const done = its.length > 0 && its.every(itemResolved);
          return (
            <button
              key={r.id}
              aria-pressed={r.id === roomId}
              type="button"
              onClick={() => {
                setRoomId(r.id);
                setRenaming(null);
              }}
              className={cn(
                rental
                  ? "flex min-h-14 items-center gap-3 rounded-xl border px-3 text-left text-sm font-medium"
                  : "min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium",
                r.id === roomId
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background",
                done && r.id !== roomId && "border-emerald-600/50",
              )}
            >
              {rental ? (
                <>
                  <Folder className="size-5 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <strong className="block break-words">{r.name}</strong>
                    <span className="block text-xs opacity-90">
                      {photoCount} {photoCount === 1 ? "foto" : "fotos"}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  {done && <Check className="mr-1 inline size-3.5" />}
                  {r.name}
                </>
              )}
            </button>
          );
        })}
        {!readOnly && (!rental || !adding) && (
          <button
            type="button"
            onClick={() => setAdding({ name: "", kind: "outro" })}
            className={
              rental && !data.rooms.length
                ? "min-h-12 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
                : "min-h-11 shrink-0 rounded-xl border border-dashed border-primary/50 px-4 text-sm font-medium text-primary"
            }
          >
            <Plus className="mr-1 inline size-4" />
            {rental ? "Adicionar cômodo" : "Ambiente"}
          </button>
        )}
      </div>

      {adding && (
        <div className="premium-card mb-3 space-y-2 rounded-2xl p-3">
          <Input
            autoFocus
            aria-label={rental ? "Nome do cômodo" : "Nome do ambiente"}
            placeholder={rental ? "Ex.: Cozinha, Quarto da frente" : "Ex.: Varanda"}
            maxLength={80}
            value={adding.name}
            onChange={(e) => setAdding({ ...adding, name: e.target.value })}
            className="h-11"
          />
          {!rental && (
            <select
              aria-label="Tipo do ambiente"
              value={adding.kind}
              onChange={(e) => setAdding({ ...adding, kind: e.target.value as RoomKind })}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {(
                [
                  "sala",
                  "dormitorio",
                  "suite",
                  "banheiro",
                  "cozinha",
                  "servico",
                  "garagem",
                  "externa",
                  "comercial",
                  "terreno",
                  "outro",
                ] as RoomKind[]
              ).map((k) => (
                <option key={k} value={k}>
                  {k === "externa"
                    ? "Área externa / varanda"
                    : k === "servico"
                      ? "Área de serviço"
                      : k.charAt(0).toUpperCase() + k.slice(1)}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="min-h-11 flex-1 rounded-xl border border-input text-sm"
              onClick={() => setAdding(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!adding.name.trim()}
              className="min-h-11 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40"
              onClick={async () => {
                if (addingRequest.current) return;
                addingRequest.current = true;
                try {
                  const created = await saver.run(
                    () =>
                      addRoomFn({
                        data: {
                          inspectionId: insp.id,
                          name: adding.name.trim(),
                          kind: adding.kind,
                          furnished,
                        },
                      }),
                    (current, row) => ({
                      ...current,
                      rooms: [...current.rooms.filter((r) => r.id !== row.id), row],
                    }),
                  );
                  if (created) {
                    setAdding(null);
                    setRoomId(created.id);
                  }
                } finally {
                  addingRequest.current = false;
                }
              }}
            >
              Adicionar
            </button>
          </div>
        </div>
      )}

      {room && (
        <section
          className={
            rental ? "rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-5" : undefined
          }
          aria-label={`${rental ? "Cômodo" : "Ambiente"} ${room.name}`}
        >
          <div className="mb-3 flex items-center gap-2">
            {renaming !== null ? (
              <>
                <Input
                  autoFocus
                  aria-label="Novo nome"
                  value={renaming}
                  onChange={(e) => setRenaming(e.target.value)}
                  className="h-11"
                />
                <button
                  type="button"
                  aria-label="Salvar nome"
                  className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"
                  onClick={async () => {
                    if (!renaming.trim()) return;
                    await saver.run(
                      () =>
                        updRoomFn({
                          data: {
                            id: room.id,
                            expectedRevision: room.revision,
                            patch: { name: renaming.trim() },
                          },
                        }),
                      (f, row) => ({ ...f, rooms: replaceRow(f.rooms, row) }),
                    );
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
                    <details className="relative">
                      <summary className="min-h-11 cursor-pointer py-3 text-sm text-primary">
                        {rental ? "Editar cômodo" : "Editar ambiente"}
                      </summary>
                      <div className="absolute right-0 z-20 flex rounded-xl border bg-background p-2">
                        <button
                          type="button"
                          aria-label="Renomear ambiente"
                          onClick={() => setRenaming(room.name)}
                          className="grid size-11 place-items-center rounded-xl hover:bg-foreground/5"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Mover ambiente para a esquerda"
                          disabled={idx <= 0}
                          onClick={() => {
                            const order = data.rooms.map((r) => r.id);
                            [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
                            void saver.run(
                              () => reorderFn({ data: { inspectionId: insp.id, order } }),
                              (f) => ({
                                ...f,
                                rooms: order.map((id, p) => ({
                                  ...f.rooms.find((r) => r.id === id)!,
                                  position: p,
                                })),
                              }),
                            );
                          }}
                          className="grid size-11 place-items-center rounded-xl hover:bg-foreground/5 disabled:opacity-30"
                        >
                          <ArrowLeft className="size-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Remover ambiente"
                          onClick={() => setConfirmDelete(true)}
                          className="grid size-11 place-items-center rounded-xl text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </details>
                  </>
                )}
              </>
            )}
          </div>

          {!rental && (
            <nav className="mb-3 grid grid-cols-3 border-b" aria-label="Registro do ambiente">
              {(["itens", "fotos", "relatos"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={area === a}
                  className={cn(
                    "min-h-11 border-b-2 text-sm font-semibold",
                    area === a
                      ? "border-primary text-primary"
                      : "border-transparent text-foreground/60",
                  )}
                  onClick={() => {
                    setArea(a);
                    if (a === "relatos") setMode("texto");
                  }}
                >
                  {
                    {
                      itens: "Itens",
                      fotos: `Fotos (${roomMedia.length + roomPending.filter((p) => p.kind === "photo").length})`,
                      relatos: `Relatos (${roomNotes.length})`,
                    }[a]
                  }
                </button>
              ))}
            </nav>
          )}
          {rental && !readOnly && (
            <div className="mb-4 flex flex-wrap gap-2" aria-label="Registro do cômodo">
              <BarButton
                icon={<Camera className="size-5" />}
                label="Tirar foto"
                onClick={() => {
                  openCamera(null);
                }}
              />
              <BarButton
                icon={<Plus className="size-5" />}
                label="Adicionar fotos"
                onClick={() => {
                  openGallery(null);
                }}
              />
              <BarButton
                icon={<Mic className="size-5" />}
                label="Gravar áudio"
                onClick={() => {
                  setEvidenceItem(null);
                  void startRecording();
                }}
              />
              <BarButton
                icon={<Keyboard className="size-5" />}
                label="Descrição"
                onClick={() => {
                  setEvidenceItem(null);
                  setMode("texto");
                  window.requestAnimationFrame(() =>
                    document
                      .getElementById("rental-room-description")
                      ?.querySelector("textarea")
                      ?.focus(),
                  );
                }}
              />
            </div>
          )}
          <div className={rental ? "grid gap-4 md:grid-cols-2" : undefined}>
            {(rental || area === "fotos") && (
              <div className="space-y-3">
                {!rental && (
                  <div className="mb-3 flex gap-2">
                    <button
                      type="button"
                      className="min-h-11 rounded-xl border px-3"
                      onClick={() => {
                        openCamera(null);
                      }}
                    >
                      Foto geral
                    </button>
                    <button
                      type="button"
                      className="min-h-11 rounded-xl border px-3"
                      onClick={() => {
                        openGallery(null);
                      }}
                    >
                      Importar da galeria
                    </button>
                  </div>
                )}
                {rental && <h3 className="text-sm font-semibold">Fotos do cômodo</h3>}
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
              </div>
            )}
            {!rental && area === "itens" && (
              <>
                <ul className="mt-4 space-y-2">
                  {roomItems.map((it) => (
                    <ItemCard
                      key={it.id}
                      item={it}
                      readOnly={readOnly}
                      saver={saver}
                      onTouched={markStarted}
                      forceOpen={props.jump?.itemId === it.id}
                      photos={roomMedia.filter((m) => m.item_id === it.id).length}
                      onPhoto={() => openCamera(it.id)}
                      onNarrate={() => {
                        setEvidenceItem(it.id);
                        setArea("relatos");
                        setMode("texto");
                      }}
                    />
                  ))}
                </ul>
                {!readOnly && <AddItem inspectionId={insp.id} roomId={room.id} saver={saver} />}
              </>
            )}
            {(rental || area === "relatos") && (
              <div id={rental ? "rental-room-description" : undefined} className="min-w-0">
                {rental && <h3 className="mb-2 text-sm font-semibold">Descrição e áudios</h3>}
                <NotesBlock
                  key={`${room.id}:${evidenceItem ?? "general"}`}
                  roomName={room.name}
                  itemId={evidenceItem}
                  notes={roomNotes}
                  items={roomItems}
                  readOnly={readOnly}
                  saver={saver}
                  voiceReady={props.voiceReady}
                  voiceAdmin={props.voiceAdmin}
                  runner={props.runner}
                  onRerecord={(n) => void startRecording(n)}
                  inspectionId={insp.id}
                  currentCtx={currentCtx}
                  mode={mode}
                  setMode={setMode}
                  roomId={room.id}
                  rental={rental}
                />
              </div>
            )}
          </div>
          {rental && roomItems.length > 0 && (
            <details className="mt-4 rounded-xl border p-3">
              <summary className="cursor-pointer text-sm font-semibold">
                Itens registrados neste cômodo
              </summary>
              <ul className="mt-3 space-y-2">
                {roomItems.map((it) => (
                  <ItemCard
                    key={it.id}
                    item={it}
                    readOnly={readOnly}
                    saver={saver}
                    onTouched={markStarted}
                    photos={roomMedia.filter((m) => m.item_id === it.id).length}
                    onPhoto={() => openCamera(it.id)}
                    onNarrate={() => {
                      setEvidenceItem(it.id);
                      setMode("texto");
                    }}
                  />
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover “{room?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Este ambiente tem avaliações, fotos ou relatos. Tudo dele será removido desta
              vistoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                room &&
                void queue
                  .pauseRoom(room.id)
                  .then(() => drafts.controller.pauseRoom(room.id))
                  .then(() =>
                    saver.run(
                      () =>
                        delRoomFn({
                          data: { id: room.id, inspectionId: insp.id, confirmed: true },
                        }),
                      (f) => ({
                        ...f,
                        rooms: f.rooms.filter((r) => r.id !== room.id),
                        items: f.items.filter((i) => i.room_id !== room.id),
                        media: f.media.filter((m) => m.room_id !== room.id),
                        notes: f.notes.filter((n) => n.room_id !== room.id),
                      }),
                    ),
                  )
                  .then(() => drafts.controller.discardRoom(room.id))
                  .then(() => discardRoomPending(props.userId!, insp.id, room.id))
                  .then(() => queue.forgetRoom(room.id))
                  .then(() => queue.refresh())
                  .catch((e) => {
                    queue.resumeRoom(room.id);
                    drafts.controller.resumeRoom(room.id);
                    toast.error(e instanceof Error ? e.message : "Falha ao remover ambiente");
                  })
              }
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InAppCamera
        open={camOpen}
        title={[room?.name, data.items.find((i) => i.id === evidenceItem)?.name].filter(Boolean).join(" · ")}
        count={roomPhotoCount}
        onClose={() => setCamOpen(false)}
        onCapture={onCameraShot}
        onNative={(reason) => {
          if (reason === "falha")
            toast.error(CAMERA_FAILED, {
              action: { label: "Usar câmera do celular", onClick: () => openNative(evidenceItem) },
            });
          openNative(evidenceItem);
        }}
      />
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => {
          void onFiles(e.target.files, "captura");
          e.target.value = "";
        }}
      />
      <input
        ref={galRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void onFiles(e.target.files, "importacao");
          e.target.value = "";
        }}
      />

      {!readOnly && room && (
        <div className="inspection-footer fixed inset-x-0 bottom-0 z-40 px-3 pt-2">
          {recording ? (
            <div className="mx-auto flex max-w-2xl items-center gap-2">
              <span className="relative grid size-11 place-items-center" aria-hidden>
                <span
                  className="absolute inset-0 motion-safe:animate-ping rounded-full bg-destructive/25"
                  style={{ transform: `scale(${0.7 + level * 1.5})` }}
                />
                <Mic className="size-5 text-destructive" />
              </span>
              <div className="min-w-0 flex-1 text-sm" aria-live="polite">
                <p className="font-semibold">Gravando · {recording.roomName}</p>
                <RecTimer startedAt={recording.startedAt} />
              </div>
              <button
                type="button"
                onClick={() => void stopRecording()}
                className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground"
              >
                <Square className="size-4" /> Parar e salvar
              </button>
            </div>
          ) : rental ? (
            <div className="mx-auto flex max-w-4xl justify-end">
              <button
                type="button"
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground sm:w-auto"
                onClick={() => {
                  props.onReview();
                  window.scrollTo({ top: 0 });
                }}
              >
                Gerar termo de {insp.rental_kind === "saida" ? "saída" : "entrada"}{" "}
                <ArrowRight className="size-4" />
              </button>
            </div>
          ) : (
            <div className="mx-auto grid max-w-2xl grid-cols-[1fr_1fr_1.5fr] gap-2">
              <BarButton
                icon={<Camera className="size-5" />}
                label="Foto"
                onClick={() => {
                  openCamera(null);
                }}
              />
              <BarButton
                icon={<Keyboard className="size-5" />}
                label="Relatar"
                onClick={() => {
                  setEvidenceItem(null);
                  setArea("relatos");
                  setMode("texto");
                  window.scrollTo({ top: 0 });
                }}
              />
              <BarButton
                icon={<ArrowRight className="size-5" />}
                label={idx === data.rooms.length - 1 ? "Revisar vistoria" : "Próximo ambiente"}
                onClick={() => {
                  const remaining = roomItems.filter((it) => !itemResolved(it)).length;
                  if (remaining)
                    toast.info(
                      `${remaining} itens continuam pendentes em ${room.name}. Você pode continuar a coleta.`,
                    );
                  if (idx === data.rooms.length - 1) props.onReview();
                  else {
                    setRoomId(data.rooms[idx + 1].id);
                    setArea("itens");
                  }
                  window.scrollTo({ top: 0 });
                }}
              />
            </div>
          )}
          {!rental && !recording && area === "relatos" && (
            <div className="mx-auto mt-1 flex max-w-2xl items-center justify-between gap-2">
              <button
                type="button"
                className="min-h-11 text-sm font-semibold text-primary"
                onClick={() => void startRecording()}
              >
                <Mic className="mr-1 inline size-4" />
                Gravar áudio
              </button>
              <p className="text-xs text-foreground/60">
                {props.voiceReady
                  ? "O áudio é salvo e transcrito automaticamente."
                  : "Transcrição indisponível no momento. O áudio será salvo."}
              </p>
            </div>
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
  return (
    <p className="text-xs tabular-nums text-foreground/60">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")} · trechos de 60 s salvos no aparelho
    </p>
  );
}

function BarButton({
  icon,
  label,
  onClick,
  disabled,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      aria-label={hint ? `${label} — ${hint}` : label}
      className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold text-foreground/80 active:bg-foreground/8 disabled:opacity-35"
    >
      {icon}
      {label}
    </button>
  );
}

function AddItem({
  inspectionId,
  roomId,
  saver,
}: {
  inspectionId: string;
  roomId: string;
  saver: Saver;
}) {
  const add = useServerFn(addItem);
  const draft = useDraftRow("new-item", { name: "" }, "new-item", roomId);
  const { controller } = useDrafts();
  const [busy, setBusy] = useState(false);
  const v = draft.value.name;
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim() || busy) return;
        setBusy(true);
        void controller
          .ensureLocal()
          .then(() =>
            saver.run(
              () => add({ data: { inspectionId, roomId, name: v.trim(), category: "especifico" } }),
              (f, row) => ({ ...f, items: [...f.items, row] }),
            ),
          )
          .then(() => draft.discard())
          .catch((e) =>
            toast.error(
              e instanceof Error
                ? e.message
                : "Não foi possível adicionar o item. O nome foi preservado.",
            ),
          )
          .finally(() => setBusy(false));
      }}
    >
      <Input
        aria-label="Novo item"
        placeholder="Adicionar item (ex.: ar-condicionado)"
        value={v}
        disabled={busy}
        onChange={(e) => draft.set({ name: e.target.value })}
        className="h-11"
      />
      <button
        type="submit"
        disabled={busy}
        aria-label="Adicionar item"
        className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
      >
        <Plus className="size-4" />
      </button>
    </form>
  );
}

/* ---------------- Fotos ---------------- */
