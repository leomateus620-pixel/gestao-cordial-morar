import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingEntry } from "@/lib/vistoria/local-store";

const db = vi.hoisted(() => ({ rows: new Map<string, PendingEntry>(), uploads: [] as string[], fail: new Set<string>() }));
vi.mock("@/lib/vistoria/local-store", async (orig) => {
  const real = await orig<typeof import("@/lib/vistoria/local-store")>();
  return {
    ...real,
    listPending: async () => [...db.rows.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    patchPending: async (k: string, p: Partial<PendingEntry>) => {
      const c = db.rows.get(k);
      if (c) db.rows.set(k, { ...c, ...p });
    },
    removePending: async (k: string) => void db.rows.delete(k),
    putPending: async (e: PendingEntry) => void db.rows.set(e.key, e),
    cacheInspection: async () => undefined,
    cachedInspection: async () => undefined,
  };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: async (path: string) => {
          const key = ([...db.rows.values()].find((r) => path.includes(r.clientKey))?.clientKey ?? path).replace("chavelocal_", "");
          if (db.fail.has(key)) return { error: { message: "StorageApiError: 503 upstream" } };
          db.uploads.push(key);
          return { error: null };
        },
      }),
    },
  },
}));
const srv = vi.hoisted(() => ({ deleted: [] as string[], delFail: false, order: [] as string[] }));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: { kind?: string }) => async (a: { data: { noteId?: string } }) => {
    if (fn?.kind === "del") {
      srv.order.push("delete");
      if (srv.delFail) throw new Error("falhou");
      srv.deleted.push(a.data.noteId!);
      return { ok: true };
    }
    if (fn?.kind === "note") srv.order.push("note");
    return { id: "n" };
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: async () => undefined }),
  useQuery: () => ({}),
}));
vi.mock("@/lib/auth-mock", () => ({ useSession: () => ({ id: "u" }) }));
vi.mock("@/lib/vistoria/vistoria.functions", () => ({ registerMedia: {}, createNote: { kind: "note" }, getInspection: {} }));
vi.mock("@/lib/vistoria/voice.functions", () => ({ transcribeNote: {}, deleteVoiceNote: { kind: "del" } }));

import { useLocalQueue, useObjectUrls } from "@/lib/vistoria/use-inspection";

const INSP = "11111111-1111-4111-8111-111111111111";
const entry = (k: string, extra: Partial<PendingEntry> = {}): PendingEntry => ({
  key: `u|${INSP}|${k}`,
  userId: "u",
  inspectionId: INSP,
  roomId: "22222222-2222-4222-8222-222222222222",
  itemId: null,
  clientKey: `chavelocal_${k}`,
  kind: "photo",
  blob: new Blob([k]),
  mime: "image/jpeg",
  takenAt: "t",
  timeSource: "captura",
  status: "local",
  attempts: 0,
  createdAt: k,
  ...extra,
});

let created: string[] = [];
let revoked: string[] = [];
beforeEach(() => {
  created = [];
  revoked = [];
  let n = 0;
  URL.createObjectURL = vi.fn(() => {
    const u = `blob:${++n}`;
    created.push(u);
    return u;
  });
  URL.revokeObjectURL = vi.fn((u: string) => void revoked.push(u));
  db.rows.clear();
  db.uploads = [];
  db.fail.clear();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useObjectUrls incremental", () => {
  it("cria só para chave nova, revoga só a removida e usa a miniatura", () => {
    const thumb = new Blob(["t"]);
    const a = entry("a", { thumb });
    const b = entry("b");
    const { result, rerender, unmount } = renderHook(({ list }) => useObjectUrls(list), {
      initialProps: { list: [a, b] },
    });
    expect(created).toHaveLength(2);
    expect(vi.mocked(URL.createObjectURL).mock.calls[0]![0]).toBe(thumb);
    const first = result.current;
    rerender({ list: [{ ...a }, { ...b, status: "enviando" }] });
    expect(created).toHaveLength(2);
    expect(revoked).toHaveLength(0);
    rerender({ list: [a] });
    expect(revoked).toEqual([first[b.key]]);
    expect(result.current[a.key]).toBe(first[a.key]);
    unmount();
    expect(revoked).toContain(first[a.key]);
  });
});

const settle = async () => {
  for (let i = 0; i < 30; i++) await act(async () => void (await Promise.resolve()));
};

describe("fila com espera crescente", () => {
  it("falha aguarda sem travar as outras; mantém o registro e mensagem amigável", async () => {
    db.rows.set(entry("a").key, entry("a"));
    db.rows.set(entry("b").key, entry("b"));
    db.fail.add("a");
    const { unmount } = renderHook(() => useLocalQueue("u", INSP));
    await settle();
    expect(db.uploads).toEqual(["b"]);
    const a = db.rows.get(entry("a").key)!;
    expect(a.status).toBe("erro");
    expect(a.attempts).toBe(1);
    expect(a.error).toBe("Não foi possível enviar. Tentaremos de novo.");
    expect(a.error).not.toMatch(/Storage|503/);
    expect(a.nextAttemptAt! - Date.now()).toBeGreaterThan(1000);
    expect(db.rows.has(entry("b").key)).toBe(false);
    unmount();
  });

  it("temporizador acorda a fila e é limpo ao sair da tela", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    db.rows.set(entry("a").key, entry("a", { status: "erro", attempts: 1, nextAttemptAt: Date.now() + 2000 }));
    const { unmount } = renderHook(() => useLocalQueue("u", INSP));
    await settle();
    expect(db.uploads).toEqual([]);
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => void vi.advanceTimersByTime(2100));
    await settle();
    expect(db.uploads).toEqual(["a"]);
    db.rows.set(entry("c").key, entry("c", { status: "erro", attempts: 1, nextAttemptAt: Date.now() + 5000 }));
    db.fail.add("c");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("voltar a internet ignora a espera e envia na hora", async () => {
    db.rows.set(entry("a").key, entry("a", { status: "erro", attempts: 2, nextAttemptAt: Date.now() + 60_000 }));
    renderHook(() => useLocalQueue("u", INSP));
    await settle();
    expect(db.uploads).toEqual([]);
    await act(async () => void window.dispatchEvent(new Event("online")));
    await settle();
    expect(db.uploads).toEqual(["a"]);
  });

  it("5 falhas aguardam 'tentar de novo', que envia na hora", async () => {
    db.rows.set(entry("a").key, entry("a", { status: "erro", attempts: 5 }));
    const { result } = renderHook(() => useLocalQueue("u", INSP));
    await settle();
    expect(db.uploads).toEqual([]);
    expect(db.rows.has(entry("a").key)).toBe(true);
    await act(async () => void (await result.current.retry(entry("a").key)));
    await settle();
    expect(db.uploads).toEqual(["a"]);
  });
});

describe("regravar relato de voz", () => {
  const voice = (k: string, extra: Partial<PendingEntry> = {}) =>
    entry(k, { kind: "voice", mime: "audio/wav", seconds: 5, replacesNoteId: "old-note", ...extra } as Partial<PendingEntry>);

  it("o anterior só é excluído depois do áudio e do relato novos confirmados", async () => {
    srv.deleted = []; srv.order = []; srv.delFail = false;
    db.rows.set(voice("v").key, voice("v"));
    renderHook(() => useLocalQueue("u", INSP));
    await settle();
    expect(db.uploads).toContain("v");
    expect(srv.order).toEqual(["note", "delete"]);
    expect(srv.deleted).toEqual(["old-note"]);
  });

  it("falha no envio do novo mantém o anterior", async () => {
    srv.deleted = []; srv.order = [];
    db.fail.add("w");
    db.rows.set(voice("w").key, voice("w"));
    renderHook(() => useLocalQueue("u", INSP));
    await settle();
    expect(srv.deleted).toEqual([]);
    expect(db.rows.get(voice("w").key)?.status).toBe("erro");
  });

  it("falha ao excluir o anterior não perde o novo nem trava a fila", async () => {
    srv.deleted = []; srv.order = []; srv.delFail = true;
    db.rows.set(voice("x").key, voice("x"));
    renderHook(() => useLocalQueue("u", INSP));
    await settle();
    expect(srv.order).toEqual(["note", "delete"]);
    expect(db.rows.has(voice("x").key)).toBe(false);
    srv.delFail = false;
  });
});
