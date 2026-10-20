/* eslint-disable react-refresh/only-export-components */
import { useBlocker } from "@tanstack/react-router";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-mock";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { DraftController } from "./draft-controller";
import { conflictingFields, draftKey, type DraftEntity } from "./draft-model";
import { listDrafts, putDraft, removeDraft } from "./local-store";
import { inspectionKey, replaceRow } from "./use-inspection";
import {
  getInspection,
  updateInspectionBasics,
  updateItem,
  updateMedia,
  updateNote,
  updateRoom,
  type InspectionFull,
} from "./vistoria.functions";
const Context = createContext<{
  controller: DraftController;
  userId: string;
  inspectionId: string;
} | null>(null);
const table = { item: "items", room: "rooms", media: "media", note: "notes" } as const;
export function InspectionDraftProvider({
  inspectionId,
  children,
}: PropsWithChildren<{ inspectionId: string }>) {
  const userId = useSession()?.id;
  const qc = useQueryClient();
  const get = useServerFn(getInspection),
    item = useServerFn(updateItem),
    room = useServerFn(updateRoom),
    media = useServerFn(updateMedia),
    note = useServerFn(updateNote),
    basics = useServerFn(updateInspectionBasics);
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const controller = useMemo(
    () =>
      new DraftController({ put: putDraft, remove: removeDraft }, async (entry) => {
        if (!userId || entry.userId !== userId)
          throw new Error("Conta alterada. Abra a vistoria novamente.");
        const full = await get({ data: { id: inspectionId } });
        qc.setQueryData(inspectionKey(inspectionId, userId), full);
        const remote =
          entry.entity === "inspection"
            ? full.inspection
            : entry.entity in table
              ? full[table[entry.entity as keyof typeof table]].find((r) => r.id === entry.entityId)
              : null;
        if (!remote)
          throw new Error("Destino removido. Preserve ou descarte o rascunho na revisão.");
        const conflicts = conflictingFields(entry, remote);
        if (conflicts.length)
          throw new Error(
            `CONFLITO: ${conflicts.join(", ")} mudou em outra tela. Seu texto foi preservado.`,
          );
        if (!controller.isActive())
          throw new Error("Edição interrompida ao sair desta conta ou vistoria.");
        const payload = {
          data: { id: entry.entityId, expectedRevision: remote.revision, patch: entry.patch },
        };
        const row = await (
          entry.entity === "item"
            ? item
            : entry.entity === "room"
              ? room
              : entry.entity === "media"
                ? media
                : entry.entity === "note"
                  ? note
                  : basics
        )(payload as never);
        qc.setQueryData<InspectionFull>(inspectionKey(inspectionId, userId), (f) =>
          f
            ? entry.entity === "inspection"
              ? { ...f, inspection: row }
              : {
                  ...f,
                  [table[entry.entity as keyof typeof table]]: replaceRow(
                    f[table[entry.entity as keyof typeof table]],
                    row,
                  ),
                }
            : f,
        );
        // Child writes also advance the aggregate revision on the server.
        void qc.invalidateQueries({ queryKey: inspectionKey(inspectionId, userId) });
        return row.revision;
      }),
    [userId, inspectionId, qc, get, item, room, media, note, basics],
  );
  useBlocker({
    shouldBlockFn: async () => {
      try {
        await controller.ensureLocal();
        return false;
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "O rascunho ainda não foi salvo neste aparelho.",
        );
        return true;
      }
    },
    enableBeforeUnload: false,
  });
  useEffect(() => {
    let active = true;
    setReady(false);
    setError("");
    controller.resume();
    if (userId)
      void listDrafts(userId, inspectionId)
        .then((entries) => {
          if (active) {
            controller.hydrate(entries);
            setReady(true);
          }
        })
        .catch((e) => {
          if (active)
            setError(
              `Armazenamento local indisponível: ${e.message}. Libere espaço ou use outro navegador antes de editar.`,
            );
        });
    const online = () => {
      controller.retry();
      void controller.flush();
    };
    window.addEventListener("online", online);
    const before = (e: BeforeUnloadEvent) => {
      if (
        Object.values(controller.snapshot()).some(
          (v) => v.status === "persisting" || v.durable === false,
        )
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => {
      active = false;
      controller.stop();
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", before);
    };
  }, [controller, userId, inspectionId]);
  if (error)
    return (
      <p role="alert" className="p-4 text-destructive">
        {error}
      </p>
    );
  if (!ready || !userId)
    return (
      <p role="status" className="p-4">
        Recuperando rascunhos deste aparelho…
      </p>
    );
  return (
    <Context.Provider value={{ controller, userId: userId, inspectionId }}>
      {children}
    </Context.Provider>
  );
}
export function useDrafts() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("Fora do contexto de rascunhos");
  const views = useSyncExternalStore(
    ctx.controller.subscribe,
    ctx.controller.snapshot,
    ctx.controller.snapshot,
  );
  return { ...ctx, views, pending: Object.values(views) };
}
export function useDraftRow<T extends object>(
  entity: DraftEntity,
  remote: T,
  entityId: string,
  roomId: string | null = null,
) {
  const ctx = useDrafts();
  const scope = { userId: ctx.userId, inspectionId: ctx.inspectionId, roomId, entity, entityId };
  const key = draftKey(scope);
  const view = ctx.views[key];
  const value = { ...remote, ...view?.entry.patch } as T;
  const set = (patch: Partial<T>) =>
    ctx.controller.edit(scope, remote as Record<string, unknown>, patch as Record<string, unknown>);
  return { value, set, view, key, discard: () => ctx.controller.discard(key) };
}
export function DraftStatus() {
  const { pending, controller } = useDrafts();
  if (!pending.length) return null;
  const problem = pending.find((v) => v.status === "error" || v.status === "conflict");
  const saving = pending.some((v) => v.status === "sending"),
    persisting = pending.some((v) => v.status === "persisting");
  return (
    <div role="status" className="text-xs leading-5">
      <span className={problem ? "text-destructive" : "text-primary"}>
        {problem
          ? `Falha ao salvar · ${problem.error}`
          : persisting
            ? "Gravando no aparelho…"
            : saving
              ? "Enviando alterações…"
              : `No aparelho · ${pending.length} alteração(ões) aguardando envio`}
      </span>
      {problem && (
        <button
          type="button"
          className="ml-2 min-h-11 underline"
          onClick={() => controller.retry()}
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}
