import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth-mock";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  cacheInspection,
  cachedInspection,
  listPending,
  patchPending,
  putPending,
  removePending,
  type PendingEntry,
} from "./local-store";
import { mediaPath } from "./model";
import {
  createNote,
  getInspection,
  registerMedia,
  type InspectionFull,
} from "./vistoria.functions";
import { transcribeNote } from "./voice.functions";

export const BUCKET = "inspection-media";
export const inspectionKey = (id: string, userId?: string) =>
  ["inspection", userId ?? "signed-out", id] as const;

export type SaveState = {
  kind: "idle" | "saving" | "saved" | "error" | "conflict";
  at?: string;
  message?: string;
};

export function useInspection(id: string) {
  const user = useSession();
  const fetchFull = useServerFn(getInspection);
  return useQuery({
    queryKey: inspectionKey(id, user?.id),
    enabled: Boolean(user),
    networkMode: "always",
    queryFn: async () => {
      const cached = user
        ? await cachedInspection<InspectionFull>(user.id, id).catch(() => undefined)
        : undefined;
      if (!navigator.onLine && cached) return { ...cached, cacheMode: true };
      try {
        const data = await fetchFull({ data: { id } });
        if (user) await cacheInspection(user.id, id, data).catch(() => undefined);
        return { ...data, cacheMode: false };
      } catch (e) {
        // Authorization failures must never fall back to an old authorized view.
        const message = e instanceof Error ? e.message : "";
        if (cached && (!navigator.onLine || /fetch|network|conexão|Failed to fetch/i.test(message)))
          return { ...cached, cacheMode: true };
        throw e;
      }
    },
    staleTime: 10_000,
  });
}

/** Envolve chamadas de gravação com estado de salvamento real (só "salvo" após o servidor confirmar). */
export function useSaver(id: string) {
  const user = useSession();
  const qc = useQueryClient();
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const inFlight = useRef(0);
  const run = useCallback(
    async <T>(
      fn: () => Promise<T>,
      apply?: (full: InspectionFull, result: T) => InspectionFull,
    ): Promise<T | undefined> => {
      inFlight.current++;
      setState({ kind: "saving" });
      try {
        const res = await fn();
        if (apply)
          qc.setQueryData<InspectionFull>(inspectionKey(id, user?.id), (cur) =>
            cur ? apply(cur, res) : cur,
          );
        inFlight.current--;
        setState(
          inFlight.current ? { kind: "saving" } : { kind: "saved", at: new Date().toISOString() },
        );
        void qc.invalidateQueries({ queryKey: inspectionKey(id, user?.id) });
        return res;
      } catch (e) {
        inFlight.current--;
        const msg = e instanceof Error ? e.message : "Falha ao salvar";
        const conflict = msg.startsWith("CONFLITO");
        setState({
          kind: conflict ? "conflict" : "error",
          message: msg.replace(/^CONFLITO: /, ""),
        });
        if (conflict) void qc.invalidateQueries({ queryKey: inspectionKey(id, user?.id) });
        throw e;
      }
    },
    [id, qc, user?.id],
  );
  return { state, run };
}

export function replaceRow<T extends { id: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((r) => r.id === row.id);
  if (i < 0) return [...list, row];
  const copy = list.slice();
  copy[i] = row;
  return copy;
}

/**
 * Fila local → servidor, concorrência 1. Remove do aparelho só depois do
 * registro confirmado. Retoma ao abrir a tela e ao reconectar.
 */
export function useLocalQueue(
  userId: string | undefined,
  inspectionId: string,
  voiceReady: boolean,
) {
  const qc = useQueryClient();
  const register = useServerFn(registerMedia);
  const addNote = useServerFn(createNote);
  const transcribe = useServerFn(transcribeNote);
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const running = useRef(false);
  const pausedRooms = useRef(new Set<string>());
  const completion = useRef<Promise<void>>(Promise.resolve());
  const finish = useRef<() => void>(() => undefined);
  const [unpersisted, setUnpersisted] = useState<PendingEntry[]>([]);
  const volatile = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const list = await listPending(userId, inspectionId);
      if (alive.current) {
        setPending(list);
        setError(null);
      }
    } catch {
      setError("Não foi possível ler os arquivos no aparelho. A emissão está bloqueada.");
    }
  }, [userId, inspectionId]);

  const process = useCallback(async () => {
    if (!userId || running.current || !navigator.onLine) return;
    running.current = true;
    completion.current = new Promise((resolve) => {
      finish.current = resolve;
    });
    try {
      const list = await listPending(userId, inspectionId);
      for (const e of list) {
        if (!alive.current) break;
        if (pausedRooms.current.has(e.roomId)) continue;
        if (e.status === "erro" && e.attempts >= 5) continue; // aguarda "tentar de novo" manual
        await patchPending(e.key, { status: "enviando" });
        await refresh();
        try {
          const ext = e.kind === "photo" ? "jpg" : "wav";
          const path = mediaPath(e.inspectionId, e.roomId, e.clientKey, ext);
          const up = await supabase.storage
            .from(BUCKET)
            .upload(path, e.blob, { contentType: e.mime, upsert: false });
          if (up.error && !/exists|duplicate/i.test(up.error.message))
            throw new Error(up.error.message);
          if (!alive.current || pausedRooms.current.has(e.roomId)) continue;
          if (e.kind === "photo") {
            await register({
              data: {
                inspectionId: e.inspectionId,
                roomId: e.roomId,
                itemId: e.itemId,
                clientKey: e.clientKey,
                storagePath: path,
                width: e.width ?? null,
                height: e.height ?? null,
                takenAt: e.takenAt,
                timeSource: e.timeSource,
                caption: e.caption ?? null,
              },
            });
          } else {
            const note = await addNote({
              data: {
                inspectionId: e.inspectionId,
                roomId: e.roomId,
                itemId: e.itemId,
                clientKey: e.clientKey,
                source: "voz",
                audioPath: path,
                audioMime: e.mime,
                audioSeconds: e.seconds ?? null,
                text: null,
              },
            });
            await removePending(e.key);
            if (voiceReady && note?.id)
              void transcribe({ data: { noteId: note.id } })
                .catch(() => undefined)
                .finally(() =>
                  qc.invalidateQueries({ queryKey: inspectionKey(inspectionId, userId) }),
                );
          }
          await removePending(e.key);
          await qc.invalidateQueries({ queryKey: inspectionKey(inspectionId, userId) });
        } catch (err) {
          await patchPending(e.key, {
            status: "erro",
            attempts: e.attempts + 1,
            error: err instanceof Error ? err.message.slice(0, 200) : "Falha no envio",
          });
        }
        await refresh();
      }
    } catch (e) {
      setError(
        `Falha ao acessar a fila neste aparelho: ${e instanceof Error ? e.message : "armazenamento indisponível"}`,
      );
    } finally {
      running.current = false;
      finish.current();
    }
  }, [userId, inspectionId, register, addNote, transcribe, voiceReady, qc, refresh]);

  useEffect(() => {
    alive.current = true;
    void refresh().then(process);
    const online = () => void process();
    window.addEventListener("online", online);
    const vis = () => document.visibilityState === "visible" && void process();
    document.addEventListener("visibilitychange", vis);
    return () => {
      alive.current = false;
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [refresh, process]);

  const retry = useCallback(
    async (key: string) => {
      await patchPending(key, { status: "local", attempts: 0, error: null });
      await refresh();
      await process();
    },
    [refresh, process],
  );
  const stage = async (entry: Omit<PendingEntry, "key">) => {
    try {
      await putPending(entry);
      return true;
    } catch (e) {
      const failed = {
        ...entry,
        key: `${entry.userId}|${entry.inspectionId}|${entry.clientKey}`,
        error: `Não salvo no aparelho: ${e instanceof Error ? e.message : "armazenamento indisponível"}`,
      };
      volatile.current = true;
      setUnpersisted((cur) => [...cur.filter((p) => p.key !== failed.key), failed]);
      return false;
    }
  };
  const retryLocal = async (key: string) => {
    const entry = unpersisted.find((p) => p.key === key);
    if (!entry) return;
    const ok = await stage(entry);
    if (ok) {
      volatile.current = unpersisted.some((p) => p.key !== key);
      setUnpersisted((cur) => cur.filter((p) => p.key !== key));
      await refresh();
      void process();
    }
  };
  const pauseRoom = async (roomId: string) => {
    pausedRooms.current.add(roomId);
    await completion.current;
  };
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (unpersisted.length) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [unpersisted.length]);
  return {
    pending,
    refresh,
    process,
    retry,
    error,
    unpersisted,
    stage,
    retryLocal,
    pauseRoom,
    hasUnpersisted: () => volatile.current,
    resumeRoom: (roomId: string) => {
      pausedRooms.current.delete(roomId);
      void process();
    },
    forgetRoom: (roomId: string) => {
      volatile.current = unpersisted.some((p) => p.roomId !== roomId);
      setUnpersisted((cur) => cur.filter((p) => p.roomId !== roomId));
    },
  };
}

/** URLs de prévia locais, revogadas ao trocar a lista ou desmontar. */
export function useObjectUrls(entries: PendingEntry[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const e of entries) if (e.kind === "photo") map[e.key] = URL.createObjectURL(e.blob);
    setUrls(map);
    return () => Object.values(map).forEach((u) => URL.revokeObjectURL(u));
  }, [entries]);
  return urls;
}
