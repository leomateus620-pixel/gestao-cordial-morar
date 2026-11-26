import {
  armCaptureMarker,
  clearCaptureMarker,
  readResumeMarker,
  type CaptureMarker,
  type CaptureOrigin,
  type CaptureTarget,
} from "@/lib/vistoria/capture-resume";
import {
  canKeepOriginal,
  ImageMemoryError,
  prepareVideoPhoto,
  readImageHeader,
  TOO_BIG_MESSAGE,
  type PreparedImage,
} from "@/lib/vistoria/image-prepare";
import { hasPendingMedia, newClientKey } from "@/lib/vistoria/local-store";
import { prepareImage } from "@/lib/vistoria/media-client";
import type { MediaRow, RoomRow } from "@/lib/vistoria/types";
import type { useLocalQueue } from "@/lib/vistoria/use-inspection";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Queue = ReturnType<typeof useLocalQueue>;

function captureStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function finishMarker(marker: CaptureMarker) {
  const storage = captureStorage();
  if (storage) clearCaptureMarker(storage, marker.userId, marker.inspectionId, marker);
}

async function prepareFile(file: File): Promise<PreparedImage> {
  if (file.type && !file.type.startsWith("image/"))
    throw new Error("Escolha um arquivo de imagem.");
  try {
    return await prepareImage(file);
  } catch (e) {
    if (e instanceof ImageMemoryError) throw e;
    if (canKeepOriginal(file)) {
      const header = readImageHeader(new Uint8Array(await file.slice(0, 65536).arrayBuffer()));
      if (header?.width && header.height)
        return { blob: file, thumb: null, width: header.width, height: header.height };
    }
    throw new Error("Não foi possível ler a imagem. Tire outra foto ou escolha um JPEG ou PNG.");
  }
}

export function useInspectionPhotos({
  userId,
  inspectionId,
  rooms,
  media,
  queue,
  setRoomId,
  markStarted,
  onPreparingChange,
}: {
  userId?: string;
  inspectionId: string;
  rooms: RoomRow[];
  media: MediaRow[];
  queue: Queue;
  setRoomId: (id: string) => void;
  markStarted: () => Promise<void>;
  onPreparingChange: (busy: boolean) => void;
}) {
  const [camera, setCamera] = useState<CaptureTarget | null>(null);
  const [resume, setResume] = useState<CaptureMarker | null>(null);
  const picker = useRef<{ input: HTMLInputElement; marker: CaptureMarker } | null>(null);
  const lastMarker = useRef<CaptureMarker | null>(null);
  const preparing = useRef(false);
  const initialRooms = useRef(rooms);

  useEffect(() => {
    const storage = captureStorage();
    const marker = userId && storage && readResumeMarker(storage, userId, inspectionId);
    if (!marker || !initialRooms.current.some((room) => room.id === marker.roomId)) return;
    let active = true;
    setRoomId(marker.roomId);
    const checkCommit = marker.clientKey
      ? hasPendingMedia(marker.userId, marker.inspectionId, marker.clientKey).catch(() => false)
      : Promise.resolve(false);
    void checkCommit.then((committed) => {
      if (!active) return;
      if (committed) finishMarker(marker);
      else setResume(marker);
    });
    return () => {
      active = false;
    };
  }, [userId, inspectionId, setRoomId]);

  useEffect(
    () => () => {
      picker.current?.input.remove();
      picker.current = null;
    },
    [],
  );

  const recovered = resume?.clientKey && media.some((row) => row.client_key === resume.clientKey);
  useEffect(() => {
    if (!resume || !recovered) return;
    finishMarker(resume);
    setResume(null);
  }, [recovered, resume]);
  useEffect(() => {
    const marker = lastMarker.current;
    if (marker && queue.pending.some((entry) => entry.clientKey === marker.clientKey)) {
      finishMarker(marker);
      lastMarker.current = null;
      setResume((prev) =>
        prev?.roomId === marker.roomId && prev?.itemId === marker.itemId ? null : prev,
      );
    }
  }, [queue.pending]);

  function dismissResume() {
    if (resume) finishMarker(resume);
    setResume(null);
  }

  function canStart() {
    if (queue.hasUnpersisted()) {
      toast.error("Tente salvar a mídia pendente no aparelho para continuar.");
      return false;
    }
    if (preparing.current) {
      toast.info("Aguarde a foto em preparação.");
      return false;
    }
    return true;
  }

  function arm(target: CaptureTarget, origin: CaptureOrigin) {
    const data = { ...target, origin, clientKey: newClientKey() };
    const storage = captureStorage();
    const marker = storage
      ? armCaptureMarker(storage, data)
      : { ...data, at: Date.now(), loadId: "" };
    lastMarker.current = marker;
    return marker;
  }

  function markCommitted(marker: CaptureMarker) {
    finishMarker(marker);
    if (lastMarker.current === marker) lastMarker.current = null;
    setResume((prev) =>
      prev?.roomId === marker.roomId && prev?.itemId === marker.itemId ? null : prev,
    );
  }

  async function stagePhoto(photo: PreparedImage, marker: CaptureMarker) {
    const { blob, thumb, width, height } = photo;
    const date = new Date(marker.at).toISOString();
    const ok = await queue.stage({
      userId: marker.userId,
      inspectionId: marker.inspectionId,
      roomId: marker.roomId,
      itemId: marker.itemId,
      clientKey: marker.clientKey!,
      kind: "photo",
      blob,
      thumb,
      mime: blob.type,
      width: width <= 20_000 ? width : null,
      height: height <= 20_000 ? height : null,
      timeSource: marker.origin === "galeria" ? "importacao" : "captura",
      takenAt: date,
      createdAt: date,
      status: "local",
      attempts: 0,
    });
    if (ok) {
      markCommitted(marker);
      await queue.refresh();
    }
    return ok;
  }

  function prepareState(active: boolean) {
    preparing.current = active;
    onPreparingChange(active);
  }

  async function receiveFiles(files: File[], marker: CaptureMarker) {
    prepareState(true);
    let saved = false;
    try {
      for (const [idx, file] of files.entries()) {
        const fileMarker = idx === 0 ? marker : arm(marker, "galeria");
        let photo: PreparedImage;
        const started = performance.now();
        try {
          photo = await prepareFile(file);
        } catch (e) {
          finishMarker(fileMarker);
          if (import.meta.env.DEV)
            console.debug("[vistoria] preparação", {
              bytes: file.size,
              ms: Math.round(performance.now() - started),
              error: (e as Error).name,
            });
          toast.error(e instanceof Error ? e.message : TOO_BIG_MESSAGE);
          continue;
        }
        if (!(await stagePhoto(photo, fileMarker))) {
          if (idx + 1 < files.length)
            toast.error(
              "As outras fotos ficaram na galeria. Selecione-as após salvar a foto pendente.",
            );
          break;
        }
        saved = true;
        if (import.meta.env.DEV)
          console.debug("[vistoria] foto gravada", {
            bytes: file.size,
            output: photo.blob.size,
            width: photo.width,
            height: photo.height,
            ms: Math.round(performance.now() - started),
          });
      }
    } finally {
      prepareState(false);
      if (saved) void markStarted().finally(queue.process);
    }
  }

  function openPicker(target: CaptureTarget, origin: "camera" | "galeria") {
    setCamera(null);
    if (!canStart()) return;
    if (picker.current) {
      picker.current.input.remove();
      finishMarker(picker.current.marker);
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.hidden = true;
    if (origin === "camera") input.setAttribute("capture", "environment");
    else input.multiple = true;

    const marker = arm(target, origin);
    const request = { input, marker };
    picker.current = request;
    const clearPicker = () => {
      input.remove();
      if (picker.current !== request) return false;
      picker.current = null;
      return true;
    };
    input.addEventListener(
      "change",
      () => {
        const files = Array.from(input.files ?? []);
        input.value = "";
        if (!clearPicker()) return;
        if (files.length) void receiveFiles(input.multiple ? files : files.slice(0, 1), marker);
        else finishMarker(marker);
      },
      { once: true },
    );
    input.addEventListener(
      "cancel",
      () => {
        if (clearPicker()) finishMarker(marker);
      },
      { once: true },
    );
    document.body.append(input);
    // Permanece na mesma pilha do toque, inclusive quando chamado pelo painel da câmera.
    input.click();
  }

  function openCamera(target: CaptureTarget) {
    if (!canStart()) return;
    if (picker.current) {
      picker.current.input.remove();
      finishMarker(picker.current.marker);
      picker.current = null;
    }
    setCamera(target);
  }

  async function shoot(target: CaptureTarget, video: HTMLVideoElement): Promise<Blob | null> {
    if (!canStart()) return null;
    prepareState(true);
    const marker = arm(target, "app");
    let photo: PreparedImage;
    try {
      try {
        photo = await prepareVideoPhoto(video);
      } catch (e) {
        finishMarker(marker);
        throw e;
      }
      if (!(await stagePhoto(photo, marker)))
        throw new Error(
          "A foto ainda não foi salva. Volte ao cômodo para tentar salvar no aparelho.",
        );
      void markStarted().finally(queue.process);
      return photo.thumb;
    } finally {
      prepareState(false);
    }
  }

  return {
    camera,
    closeCamera: () => setCamera(null),
    resume: recovered ? null : resume,
    dismissResume,
    openPicker,
    openCamera,
    shoot,
    isPreparing: () => preparing.current,
  };
}
