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
import {
  readRememberedCompetence,
  rentalSearch,
  type RentalSearch,
} from "@/lib/rentals/competence-nav";
import { cn } from "@/lib/utils";
import { DraftStatus, useDraftRow, useDrafts } from "@/lib/vistoria/drafts";
import { discardRoomPending, newClientKey, type PendingEntry } from "@/lib/vistoria/local-store";
import { startRecorder, type Recorder } from "@/lib/vistoria/media-client";
import { checkDeviceStorage, LOW_MESSAGE } from "@/lib/vistoria/storage-persist";
import { InAppCamera } from "./in-app-camera";
import { useInspectionPhotos } from "./use-inspection-photos";
import {
  itemResolved,
  reviewIssues,
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
  Images,
  Keyboard,
  Loader2,
  Mic,
  Pencil,
  Plus,
  Square,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { RoomIcon, roomKindFromName } from "./room-icon";
type Saver = ReturnType<typeof useSaver>;
type Queue = ReturnType<typeof useLocalQueue>;
type Tab = "ambientes" | "dados" | "revisao";
export function VistoriaWorkspace({
  vistoriaId,
  returnToRentalForm = false,
  fromCentral = false,
  resumeRoom,
  openReview = false,
}: {
  vistoriaId: string;
  returnToRentalForm?: boolean;
  fromCentral?: boolean;
  resumeRoom?: string;
  openReview?: boolean;
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
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const pending = useMemo(() => {
    const confirmed = new Set(data?.media.map((photo) => photo.client_key));
    return queue.pending.filter(
      (entry) => entry.kind !== "photo" || !confirmed.has(entry.clientKey),
    );
  }, [data?.media, queue.pending]);
  const firstLoad = useRef(true);
  useEffect(() => {
    if (data && firstLoad.current) {
      firstLoad.current = false;
      if (data.inspection.status === "concluida" || openReview) setTab("revisao");
    }
  }, [data, openReview]);
  useEffect(() => {
    if (!data?.rooms.length) return;
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(`vistoria:${session?.id}:${vistoriaId}:room`);
    } catch {
      // A vistoria continua acessível sem armazenamento de preferências.
    }
    const named = resumeRoom ? data.rooms.filter((r) => r.name === resumeRoom) : [];
    setRoomId((cur) => {
      if (cur && data.rooms.some((r) => r.id === cur)) return cur;
      if (named.length === 1) return named[0].id;
      if (saved && data.rooms.some((r) => r.id === saved)) return saved;
      return named[0]?.id ?? data.rooms[0].id;
    });
  }, [data?.rooms, vistoriaId, session?.id, resumeRoom]);
  useEffect(() => {
    try {
      if (roomId) sessionStorage.setItem(`vistoria:${session?.id}:${vistoriaId}:room`, roomId);
    } catch {
      // A seleção atual continua disponível nesta tela.
    }
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
    <div className={cn("inspection-workspace mx-auto w-full max-w-5xl pb-40")}>
      <header className="sticky top-0 z-20 -mx-4 mb-3 border-b border-border/50 bg-background px-4 pb-2 pt-2 backdrop-blur">
        <div className="flex items-center gap-2">
          {insp.rental_contract_id && !fromCentral ? (
            <Link
              to="/alugueis"
              aria-label="Voltar ao aluguel"
              search={rentalSearch<RentalSearch>(
                { competencia: readRememberedCompetence() },
                returnToRentalForm
                  ? { formulario: insp.rental_contract_id, etapa: "vistorias" }
                  : { id: insp.rental_contract_id, etapa: "vistorias" },
              )}
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
            <h1 className="text-sm font-bold sm:text-base">
              Nº {insp.numero} · {KIND_LABEL[insp.kind as InspectionKind]}
            </h1>
            <p className="break-words text-xs text-foreground/60 sm:text-sm">{snap.endereco}</p>
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
          <SaveIndicator state={saver.state} pending={pending} serverTime={data.serverTime} />
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
          queue={{ ...queue, pending }}
          onPreparingChange={setPreparingPhotos}
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
          pending={pending}
          queueBlocked={
            preparingPhotos ||
            Boolean(queue.error) ||
            queue.unpersisted.length > 0 ||
            Boolean(data.cacheMode)
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
  onPreparingChange: (active: boolean) => void;
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
  const [storageLow, setStorageLow] = useState(false);
  const itemKey = `vistoria:${props.userId}:${insp.id}:item`;
  useEffect(() => {
    if (!props.userId) return;
    let store: Storage | undefined;
    try {
      store = window.localStorage;
    } catch {
      // A gravação de fotos continua a usar IndexedDB.
    }
    void checkDeviceStorage(navigator.storage, store).then(setStorageLow);
  }, [props.userId, insp.id]);
  useEffect(() => {
    if (!props.jump) return;
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

  const photos = useInspectionPhotos({
    userId: props.userId,
    inspectionId: insp.id,
    rooms: data.rooms,
    media: data.media,
    queue,
    setRoomId,
    markStarted,
    onPreparingChange: props.onPreparingChange,
  });
  const resume = photos.resume;
  const camera = photos.camera;
  function targetFor(itemId: string | null) {
    if (!props.userId || !room) return null;
    return { userId: props.userId, inspectionId: insp.id, roomId: room.id, itemId };
  }
  function openCamera(itemId: string | null) {
    const target = targetFor(itemId);
    if (target) photos.openCamera(target);
  }
  function openGallery(itemId: string | null) {
    const target = targetFor(itemId);
    if (target) photos.openPicker(target, "galeria");
  }

  /* ---------- Voz ---------- */
  const openingRecorder = useRef(false);
  const recorderMounted = useRef(false);
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
  currentCtx.current =
    room && props.active
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

  const startRecording = useCallback(
    async (replaces?: NoteRow, itemId = evidenceItem) => {
      if (!room || recRef.current || openingRecorder.current) return;
      openingRecorder.current = true;
      const ctx: VoiceContext = {
        inspectionId: insp.id,
        roomId: room.id,
        sessionId: sessionId.current,
        itemId: replaces ? replaces.item_id : itemId,
        replacesNoteId: replaces?.id ?? null,
      };
      try {
        const rec = await startRecorder(() => {
          toast.warning("Gravação interrompida pelo sistema. O trecho gravado foi salvo.");
          void stopRecording();
        });
        if (
          !recorderMounted.current ||
          currentCtx.current?.roomId !== ctx.roomId ||
          document.hidden
        ) {
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
          roomName: [room.name, data.items.find((i) => i.id === ctx.itemId)?.name]
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
      } finally {
        openingRecorder.current = false;
      }
    },
    [room, insp.id, stopRecording, saveSegment, markStarted, evidenceItem, data.items],
  );

  const stopRef = useRef(stopRecording);
  stopRef.current = stopRecording;
  useBlocker({
    shouldBlockFn: async () => {
      if (recRef.current) await stopRef.current();
      return photos.isPreparing() || queue.hasUnpersisted();
    },
    enableBeforeUnload: () =>
      Boolean(recRef.current) || photos.isPreparing() || queue.hasUnpersisted(),
  });
  useEffect(() => {
    recorderMounted.current = true;
    return () => {
      recorderMounted.current = false;
    };
  }, []);
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
      setEvidenceItem(
        data.items.some((item) => item.id === resume.itemId && item.room_id === roomId)
          ? resume.itemId
          : null,
      );
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

  if (!data.rooms.length && readOnly)
    return <p className="text-sm text-foreground/60">Sem ambientes.</p>;

  const roomItems = room ? data.items.filter((i) => i.room_id === room.id) : [];
  const roomMedia = room ? data.media.filter((m) => m.room_id === room.id) : [];
  const roomNotes = room ? data.notes.filter((n) => n.room_id === room.id) : [];
  const roomPending = room ? queue.pending.filter((p) => p.roomId === room.id) : [];

  const photoCount = (id: string) =>
    data.media.filter((photo) => photo.room_id === id).length +
    queue.pending.filter((entry) => entry.roomId === id && entry.kind === "photo").length;
  const roomPhotoCount = room ? photoCount(room.id) : 0;
  const reviewCount = readOnly
    ? 0
    : reviewIssues({
        basics: insp,
        rooms: data.rooms,
        items: data.items,
        media: data.media,
        notes: data.notes,
        localPending: queue.pending.map((entry) => ({
          room_id: entry.roomId,
          kind: entry.kind,
          status: entry.status,
        })),
      }).length + drafts.pending.length;
  const reviewNotice = photos.isPreparing()
    ? "Preparando mídia no aparelho"
    : queue.unpersisted.length || queue.error
      ? "Há mídia aguardando gravação no aparelho"
      : data.cacheMode
        ? "Reconecte para emitir"
        : reviewCount
          ? `${reviewCount} ${reviewCount === 1 ? "pendência" : "pendências"} antes de emitir`
          : "";
  function openDescription(itemId: string | null = null) {
    setEvidenceItem(itemId);
    setMode("texto");
    window.requestAnimationFrame(() =>
      document.querySelector<HTMLTextAreaElement>("#room-notes textarea")?.focus(),
    );
  }

  return (
    <div>
      {resume && !readOnly && (
        <div
          role="alert"
          className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
        >
          <p>
            <AlertTriangle className="mr-2 inline size-4" aria-hidden />
            {resume.origin === "galeria"
              ? "A seleção da galeria foi interrompida antes de salvar todas as fotos."
              : "A captura foi interrompida antes de salvar a foto."}{" "}
            Confira as fotos de{" "}
            <strong>{data.rooms.find((r) => r.id === resume.roomId)?.name}</strong> e refaça a que
            faltou.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="min-h-11 rounded-lg border border-amber-400 px-3 font-semibold"
              onClick={() => {
                setRoomId(resume.roomId);
                photos.openCamera(resume);
              }}
            >
              Tirar foto
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg border border-amber-400 px-3 font-semibold"
              onClick={() => {
                setRoomId(resume.roomId);
                photos.openPicker(resume, "galeria");
              }}
            >
              Escolher da galeria
            </button>
            <button
              type="button"
              className="min-h-11 px-3 underline"
              onClick={photos.dismissResume}
            >
              Dispensar aviso
            </button>
          </div>
        </div>
      )}
      {storageLow && (
        <p
          role="alert"
          className="mb-3 rounded-xl border border-destructive/40 p-3 text-sm text-destructive"
        >
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
      <section className="mb-4" aria-labelledby="inspection-rooms-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="inspection-rooms-title" className="text-base font-semibold">
            Cômodos
          </h2>
          {!readOnly && !adding && (
            <button
              type="button"
              onClick={() => setAdding({ name: "", kind: "outro" })}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/35 bg-card px-3 text-sm font-semibold text-primary"
            >
              <Plus className="size-4" aria-hidden /> Adicionar cômodo
            </button>
          )}
        </div>
        {data.rooms.length > 0 && (
          <div
            className="mt-2 grid max-h-60 gap-2 overflow-y-auto p-1 sm:grid-cols-2 lg:grid-cols-3"
            role="group"
            aria-label="Selecionar cômodo"
          >
            {data.rooms.map((r) => {
              const count = photoCount(r.id);
              const selected = r.id === roomId;
              return (
                <button
                  key={r.id}
                  aria-pressed={selected}
                  type="button"
                  onClick={() => {
                    setRoomId(r.id);
                    setRenaming(null);
                  }}
                  className={cn(
                    "flex min-h-14 min-w-0 items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm",
                    selected
                      ? "border-primary bg-primary/10 text-primary ring-1 ring-inset ring-primary"
                      : "border-border bg-card text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-lg",
                      selected ? "bg-primary text-primary-foreground" : "bg-foreground/5",
                    )}
                  >
                    <RoomIcon kind={r.kind} name={r.name} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block break-words">{r.name}</strong>
                    <span className="block text-xs text-foreground/70">
                      {count} {count === 1 ? "foto" : "fotos"}
                    </span>
                  </span>
                  {selected && <Check className="size-4 shrink-0" aria-hidden />}
                </button>
              );
            })}
          </div>
        )}
      </section>

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
                          kind: rental ? roomKindFromName(adding.name) : adding.kind,
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
                <h2 className="min-w-0 flex-1 break-words text-lg font-bold sm:text-xl">
                  {room.name}
                </h2>
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

          {!readOnly && (
            <div
              className="mx-auto mb-5 grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-4"
              role="group"
              aria-label="Ações do cômodo"
            >
              <BarButton
                icon={<Camera className="size-5" aria-hidden />}
                label="Tirar foto"
                onClick={() => openCamera(null)}
                primary
              />
              <BarButton
                icon={<Images className="size-5" aria-hidden />}
                label="Adicionar fotos"
                onClick={() => openGallery(null)}
              />
              <BarButton
                icon={
                  recording ? (
                    <Square className="size-5" aria-hidden />
                  ) : (
                    <Mic className="size-5" aria-hidden />
                  )
                }
                label={recording ? "Parar e salvar" : "Gravar áudio"}
                onClick={() =>
                  recording ? void stopRecording() : void startRecording(undefined, null)
                }
              />
              <BarButton
                icon={<Keyboard className="size-5" aria-hidden />}
                label="Escrever descrição"
                onClick={() => openDescription()}
              />
            </div>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            <section
              aria-labelledby="room-photos-title"
              className="min-w-0 space-y-3 rounded-xl border border-border p-3 sm:p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="room-photos-title" className="text-base font-semibold">
                  Fotos do cômodo
                </h3>
                {roomPhotoCount > 0 && (
                  <span className="text-sm text-foreground/60">{roomPhotoCount}</span>
                )}
              </div>
              <PhotosBlock
                key={room.id}
                inspectionId={insp.id}
                media={roomMedia}
                pending={roomPending}
                readOnly={readOnly}
                saver={saver}
                onRetry={queue.retry}
                items={roomItems}
                onCamera={() => openCamera(null)}
                onGallery={() => openGallery(null)}
              />
              {!roomMedia.some((m) => m.status === "confirmada") && (
                <NoPhotoReason
                  room={room}
                  readOnly={readOnly}
                  saver={saver}
                  forceOpen={props.jump?.kind === "ambiente_sem_foto"}
                />
              )}
            </section>
            <div id="room-notes" className="min-w-0">
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
                onRecord={() => void startRecording()}
                onRetry={queue.retry}
                pending={roomPending}
                recording={
                  recording && (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-2">
                      <span
                        className="relative grid size-9 place-items-center text-destructive"
                        aria-hidden
                      >
                        <span
                          className="absolute inset-0 rounded-full bg-destructive/15"
                          style={{ transform: `scale(${0.7 + level * 1.5})` }}
                        />
                        <Mic className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1 text-sm">
                        <p role="status" className="break-words font-semibold">
                          Gravando · {recording.roomName}
                        </p>
                        <RecTimer startedAt={recording.startedAt} />
                      </div>
                      <button
                        type="button"
                        onClick={() => void stopRecording()}
                        className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-destructive px-3 text-sm font-semibold text-destructive-foreground"
                      >
                        <Square className="size-4" aria-hidden /> Parar e salvar
                      </button>
                    </div>
                  )
                }
                inspectionId={insp.id}
                currentCtx={currentCtx}
                mode={mode}
                setMode={setMode}
                roomId={room.id}
                rental={rental}
              />
            </div>
          </div>
          {(!rental || roomItems.length > 0) && (
            <details
              open={
                !rental ||
                (props.jump?.itemId && roomItems.some((item) => item.id === props.jump?.itemId)) ||
                undefined
              }
              className="mt-4 rounded-xl border px-3 py-1"
            >
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
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
                    onNarrate={() => openDescription(it.id)}
                    forceOpen={props.jump?.itemId === it.id}
                  />
                ))}
              </ul>
              {!readOnly && !rental && (
                <AddItem inspectionId={insp.id} roomId={room.id} saver={saver} />
              )}
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

      {camera && !readOnly && (
        <InAppCamera
          open={props.active}
          title={data.rooms.find((r) => r.id === camera.roomId)?.name ?? "Cômodo"}
          count={
            data.media.filter((m) => m.room_id === camera.roomId).length +
            queue.pending.filter((p) => p.roomId === camera.roomId && p.kind === "photo").length
          }
          onClose={photos.closeCamera}
          onCapture={(video) => photos.shoot(camera, video)}
          onNative={() => photos.openPicker(camera, "camera")}
          onGallery={() => photos.openPicker(camera, "galeria")}
        />
      )}

      {!readOnly && props.active && (
        <footer className="inspection-footer fixed inset-x-0 bottom-0 z-40 px-3 pt-2">
          <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {reviewNotice && (
              <p
                className="flex-1 text-center text-sm text-foreground/70 sm:text-left"
                aria-live="polite"
              >
                {reviewNotice}
              </p>
            )}
            {!rental && idx >= 0 && idx < data.rooms.length - 1 && (
              <button
                type="button"
                className="min-h-11 rounded-xl border px-4 text-sm font-semibold text-primary"
                onClick={() => {
                  setRoomId(data.rooms[idx + 1].id);
                  window.scrollTo({ top: 0 });
                }}
              >
                Próximo cômodo
              </button>
            )}
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
              onClick={() => {
                props.onReview();
                window.scrollTo({ top: 0 });
              }}
            >
              {rental
                ? `Gerar termo de ${insp.rental_kind === "saida" ? "saída" : "entrada"}`
                : "Revisar vistoria"}
              <ArrowRight className="size-4 shrink-0" aria-hidden />
            </button>
          </div>
        </footer>
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
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </p>
  );
}

function BarButton({
  icon,
  label,
  onClick,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-center text-sm font-semibold",
        primary
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-primary/5",
      )}
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
