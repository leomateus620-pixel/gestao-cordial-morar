import { useBlocker } from "@tanstack/react-router";
import { toast } from "sonner";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DraftController } from "./draft-controller";
import { draftKey, type DraftScope } from "./draft-model";
import { listDrafts, putDraft, removeDraft } from "./local-store";
/** The UUID travels with the durable form: a retry never creates a second inspection. */
export function useCreationDraft<T extends object>(userId: string | undefined, initial: () => T) {
  const current = useRef<{
    userId: string | undefined;
    defaults: T;
    controller: DraftController;
  } | null>(null);
  if (!current.current || current.current.userId !== userId)
    current.current = {
      userId,
      defaults: initial(),
      controller: new DraftController({ put: putDraft, remove: removeDraft }, async () => 0),
    };
  const { defaults, controller } = current.current;
  const scope: DraftScope = {
    userId: userId ?? "signed-out",
    inspectionId: "new",
    roomId: null,
    entity: "creation",
    entityId: "form",
  };
  const key = draftKey(scope);

  const views = useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useBlocker({
    shouldBlockFn: async () => {
      try {
        await controller.ensureLocal();
        return false;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Rascunho ainda não salvo neste aparelho.");
        return true;
      }
    },
    enableBeforeUnload: false,
  });
  useEffect(() => {
    let alive = true;
    controller.resume();
    setReady(false);
    if (userId)
      void listDrafts(userId, "new")
        .then((entries) => {
          if (alive) {
            controller.hydrate(entries);
            setReady(true);
          }
        })
        .catch((e) => setError(e.message));
    return () => {
      alive = false;
      controller.stop();
    };
  }, [controller, userId]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      const view = controller.snapshot()[key];
      if (view && (view.status === "persisting" || view.durable === false)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [controller, key]);
  const form = (views[key]?.entry.patch.form ?? defaults) as T;
  const set = <K extends keyof T>(field: K, value: T[K] | ((prev: T[K]) => T[K])) => {
    const current = (controller.snapshot()[key]?.entry.patch.form ?? defaults) as T;
    controller.edit(
      scope,
      { form: defaults },
      {
        form: {
          ...current,
          [field]:
            typeof value === "function" ? (value as (prev: T[K]) => T[K])(current[field]) : value,
        },
      },
    );
  };
  return {
    form,
    set,
    ready,
    error: error || views[key]?.error,
    status: views[key]?.status,
    recoveries: Object.values(views).filter((v) => v.entry.recovered),
    recover: async (recoveryKey: string) => {
      const previous = controller.snapshot()[recoveryKey];
      if (!previous) return;
      controller.edit(scope, { form: defaults }, { form: previous.entry.patch.form });
      await controller.ensureLocal();
      await controller.discard(recoveryKey);
    },
    discardRecovery: (recoveryKey: string) => controller.discard(recoveryKey),
    clear: () => controller.discard(key),
    flush: () => controller.ensureLocal(),
  };
}
