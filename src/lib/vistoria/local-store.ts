import { displacedDraft, type DraftEntry } from "./draft-model";
// Fila local (IndexedDB) de fotos e áudios ainda não confirmados pelo servidor.
// Isolada por usuário + vistoria. Nada é removido daqui antes da confirmação.

export type PendingKind = "photo" | "audio";
export type PendingStatus = "local" | "enviando" | "erro";
export type PendingEntry = {
  key: string; // `${userId}|${inspectionId}|${clientKey}`
  userId: string;
  inspectionId: string;
  roomId: string;
  itemId: string | null;
  clientKey: string;
  kind: PendingKind;
  blob: Blob;
  mime: string;
  width?: number | null;
  height?: number | null;
  seconds?: number | null;
  takenAt: string;
  timeSource: "captura" | "importacao";
  caption?: string | null;
  status: PendingStatus;
  attempts: number;
  error?: string | null;
  createdAt: string;
};

const DB = "gestao-vistoria";
const STORE = "pending";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 4);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("snapshots"))
        db.createObjectStore("snapshots", { keyPath: "key" });
      if (!db.objectStoreNames.contains("drafts")) {
        const drafts = db.createObjectStore("drafts", { keyPath: "key" });
        drafts.createIndex("byInspection", ["userId", "inspectionId"]);
      }
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "key" });
        s.createIndex("byInspection", ["userId", "inspectionId"]);
      }
      const pending = req.transaction!.objectStore(STORE);
      if (!pending.indexNames.contains("byInspectionKind"))
        pending.createIndex("byInspectionKind", ["userId", "inspectionId", "kind"]);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error("Não foi possível abrir o armazenamento local."));
    req.onblocked = () =>
      reject(new Error("Feche outras abas antigas para atualizar o armazenamento local."));
  });
}
export function transactionResult<T>(
  t: IDBTransaction,
  r: IDBRequest<T>,
  close: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let result: T;
    r.onsuccess = () => {
      result = r.result;
    };
    r.onerror = () => {
      /* transaction abort is the authoritative outcome */
    };
    t.oncomplete = () => {
      close();
      resolve(result);
    };
    t.onabort = t.onerror = () => {
      close();
      reject(
        t.error ?? r.error ?? new Error("Armazenamento local indisponível. Não saia desta tela."),
      );
    };
  });
}
async function tx<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
  store = STORE,
): Promise<T> {
  const db = await open();
  try {
    const t = db.transaction(store, mode);
    return await transactionResult(t, fn(t.objectStore(store)), () => db.close());
  } catch (e) {
    db.close();
    throw e;
  }
}
export const putDraft = (entry: DraftEntry) =>
  tx(
    "readwrite",
    (s) => {
      const read = s.get(entry.key);
      read.addEventListener("success", () => {
        const recovery = displacedDraft(read.result as DraftEntry | undefined, entry);
        if (recovery) s.put(recovery);
        s.put(entry);
      });
      return read;
    },
    "drafts",
  );
export const removeDraft = (key: string, generation?: string) =>
  tx(
    "readwrite",
    (s) => {
      const read = s.get(key);
      read.addEventListener("success", () => {
        if (!generation || read.result?.generation === generation) s.delete(key);
        // A successful save in the original tab can acknowledge its archived copy,
        // but must never delete a newer draft written by another tab.
        if (generation) s.delete(`${key}~${generation}`);
      });
      return read;
    },
    "drafts",
  );
export const listDrafts = (userId: string, inspectionId: string) =>
  tx<DraftEntry[]>(
    "readonly",
    (s) => s.index("byInspection").getAll([userId, inspectionId]),
    "drafts",
  );
export async function discardRoomPending(userId: string, inspectionId: string, roomId: string) {
  for (const e of await listPending(userId, inspectionId))
    if (e.roomId === roomId) await removePending(e.key);
  for (const e of await listDrafts(userId, inspectionId))
    if (e.roomId === roomId) await removeDraft(e.key);
}

export const pendingKey = (userId: string, inspectionId: string, clientKey: string) =>
  `${userId}|${inspectionId}|${clientKey}`;

export async function putPending(e: Omit<PendingEntry, "key">) {
  const entry: PendingEntry = { ...e, key: pendingKey(e.userId, e.inspectionId, e.clientKey) };
  await tx("readwrite", (s) => s.put(entry));
  return entry;
}
export async function listPending(userId: string, inspectionId: string): Promise<PendingEntry[]> {
  const all = await tx<PendingEntry[]>("readonly", (s) =>
    s.index("byInspection").getAll([userId, inspectionId]),
  );
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function patchPending(key: string, patch: Partial<PendingEntry>) {
  const cur = await tx<PendingEntry | undefined>("readonly", (s) => s.get(key));
  if (!cur) return;
  await tx("readwrite", (s) => s.put({ ...cur, ...patch, key }));
}
export async function removePending(key: string) {
  await tx("readwrite", (s) => s.delete(key));
}

export function newClientKey() {
  const rnd = crypto.getRandomValues(new Uint8Array(12));
  return `${Date.now().toString(36)}_${Array.from(rnd, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function cacheInspection<T>(userId: string, inspectionId: string, data: T) {
  await tx(
    "readwrite",
    (s) => s.put({ key: pendingKey(userId, inspectionId, "snapshot"), data }),
    "snapshots",
  );
}
export async function cachedInspection<T>(
  userId: string,
  inspectionId: string,
): Promise<T | undefined> {
  const row = await tx<{ data: T } | undefined>(
    "readonly",
    (s) => s.get(pendingKey(userId, inspectionId, "snapshot")),
    "snapshots",
  );
  return row?.data;
}
export async function countPending(userId: string, inspectionId: string, kind?: PendingKind) {
  return tx("readonly", (s) =>
    kind
      ? s.index("byInspectionKind").count([userId, inspectionId, kind])
      : s.index("byInspection").count([userId, inspectionId]),
  );
}
