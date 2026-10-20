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
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "key" });
        s.createIndex("byInspection", ["userId", "inspectionId"]);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export const pendingKey = (userId: string, inspectionId: string, clientKey: string) => `${userId}|${inspectionId}|${clientKey}`;

export async function putPending(e: Omit<PendingEntry, "key">) {
  const entry: PendingEntry = { ...e, key: pendingKey(e.userId, e.inspectionId, e.clientKey) };
  await tx("readwrite", (s) => s.put(entry));
  return entry;
}
export async function listPending(userId: string, inspectionId: string): Promise<PendingEntry[]> {
  const all = await tx<PendingEntry[]>("readonly", (s) => s.index("byInspection").getAll([userId, inspectionId]));
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
