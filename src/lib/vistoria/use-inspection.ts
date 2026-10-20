import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { mediaPath } from "./model";
import { listPending, patchPending, removePending, type PendingEntry } from "./local-store";
import { createNote, getInspection, registerMedia, type InspectionFull } from "./vistoria.functions";
import { transcribeNote } from "./voice.functions";

export const BUCKET = "inspection-media";
export const inspectionKey = (id: string) => ["inspection", id] as const;

export type SaveState = { kind: "idle" | "saving" | "saved" | "error" | "conflict"; at?: string; message?: string };

export function useInspection(id: string) {
  const fetchFull = useServerFn(getInspection);
  return useQuery({
    queryKey: inspectionKey(id),
    queryFn: () => fetchFull({ data: { id } }),
    staleTime: 10_000,
  });
}

/** Envolve chamadas de gravação com estado de salvamento real (só "salvo" após o servidor confirmar). */
export function useSaver(id: string) {
  const qc = useQueryClient();
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, apply?: (full: InspectionFull, result: T) => InspectionFull): Promise<T | undefined> => {
      setState({ kind: "saving" });
      try {
        const res = await fn();
        if (apply) qc.setQueryData<InspectionFull>(inspectionKey(id), (cur) => (cur ? apply(cur, res) : cur));
        setState({ kind: "saved", at: new Date().toISOString() });
        return res;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Falha ao salvar";
        const conflict = msg.startsWith("CONFLITO");
        setState({ kind: conflict ? "conflict" : "error", message: msg.replace(/^CONFLITO: /, "") });
        if (conflict) void qc.invalidateQueries({ queryKey: inspectionKey(id) });
        throw e;
      }
    },
    [id, qc],
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
export function useLocalQueue(userId: string | undefined, inspectionId: string, voiceReady: boolean) {
  const qc = useQueryClient();
  const register = useServerFn(registerMedia);
  const addNote = useServerFn(createNote);
  const transcribe = useServerFn(transcribeNote);
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const running = useRef(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const list = await listPending(userId, inspectionId);
      if (alive.current) setPending(list);
    } catch {
      /* IndexedDB indisponível (modo privado): mantém lista vazia */
    }
  }, [userId, inspectionId]);

  const process = useCallback(async () => {
    if (!userId || running.current || !navigator.onLine) return;
    running.current = true;
    try {
      const list = await listPending(userId, inspectionId);
      for (const e of list) {
        if (!alive.current) break;
        if (e.status === "erro" && e.attempts >= 5) continue; // aguarda "tentar de novo" manual
        await patchPending(e.key, { status: "enviando" });
        await refresh();
        try {
          const ext = e.kind === "photo" ? "jpg" : "wav";
          const path = mediaPath(e.inspectionId, e.roomId, e.clientKey, ext);
          const up = await supabase.storage.from(BUCKET).upload(path, e.blob, { contentType: e.mime, upsert: false });
          if (up.error && !/exists|duplicate/i.test(up.error.message)) throw new Error(up.error.message);
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
            if (voiceReady && note?.id) void transcribe({ data: { noteId: note.id } }).catch(() => undefined).finally(() => qc.invalidateQueries({ queryKey: inspectionKey(inspectionId) }));
          }
          await removePending(e.key);
          await qc.invalidateQueries({ queryKey: inspectionKey(inspectionId) });
        } catch (err) {
          await patchPending(e.key, {
            status: "erro",
            attempts: e.attempts + 1,
            error: err instanceof Error ? err.message.slice(0, 200) : "Falha no envio",
          });
        }
        await refresh();
      }
    } finally {
      running.current = false;
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
  return { pending, refresh, process, retry };
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
