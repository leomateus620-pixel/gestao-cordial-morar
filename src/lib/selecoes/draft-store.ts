import { useSyncExternalStore } from "react";
import { dedupe, moveId, toggleId } from "./rules";

/**
 * Rascunho da seleção do corretor: só identificadores, no navegador, por usuário.
 * Apagado no logout (`clearAllSelectionDrafts`).
 */
export type SelectionDraft = {
  ids: string[];
  /** Seleção existente em edição (mantém o mesmo link). */
  editingId: string | null;
  editingTitle: string | null;
  /** Chave de idempotência da criação atual. */
  requestId: string;
};

const PREFIX = "cordial:selecao:";
const EMPTY: SelectionDraft = { ids: [], editingId: null, editingTitle: null, requestId: "" };

let userId: string | null = null;
let state: SelectionDraft = EMPTY;
const listeners = new Set<() => void>();

function key() {
  return userId ? `${PREFIX}${userId}` : null;
}

function newRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emit() {
  for (const l of listeners) l();
}

function persist() {
  const k = key();
  if (!k) return;
  try {
    if (!state.ids.length && !state.editingId) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, JSON.stringify(state));
  } catch {
    // Sem armazenamento: o rascunho vale só nesta aba.
  }
}

function set(next: SelectionDraft) {
  state = next;
  persist();
  emit();
}

/** Chamar em useEffect quando o usuário é conhecido. */
export function bindSelectionDraft(nextUser: string | null) {
  if (nextUser === userId) return;
  userId = nextUser;
  state = EMPTY;
  const k = key();
  if (k) {
    try {
      const raw = window.localStorage.getItem(k);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SelectionDraft>;
        state = {
          ids: dedupe(Array.isArray(parsed.ids) ? parsed.ids.filter((x) => typeof x === "string") : []),
          editingId: typeof parsed.editingId === "string" ? parsed.editingId : null,
          editingTitle: typeof parsed.editingTitle === "string" ? parsed.editingTitle : null,
          requestId: typeof parsed.requestId === "string" ? parsed.requestId : "",
        };
      }
    } catch {
      state = EMPTY;
    }
  }
  emit();
}

export const selectionDraft = {
  toggle(id: string) {
    set({ ...state, ids: toggleId(state.ids, id), requestId: state.requestId || newRequestId() });
  },
  remove(id: string) {
    set({ ...state, ids: state.ids.filter((x) => x !== id) });
  },
  move(id: string, delta: number) {
    set({ ...state, ids: moveId(state.ids, id, delta) });
  },
  reorder(ids: string[]) {
    set({ ...state, ids: dedupe(ids) });
  },
  clear() {
    set(EMPTY);
  },
  /** Abre uma seleção existente para edição (substitui o rascunho atual). */
  edit(id: string, title: string, ids: string[]) {
    set({ ids: dedupe(ids), editingId: id, editingTitle: title, requestId: newRequestId() });
  },
  /** Após salvar com sucesso. */
  finish() {
    set(EMPTY);
  },
  get(): SelectionDraft {
    return state;
  },
};

export function useSelectionDraft(): SelectionDraft {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => EMPTY,
  );
}

export function clearAllSelectionDrafts() {
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(PREFIX)) window.localStorage.removeItem(k);
    }
    window.sessionStorage.removeItem("cordial:catalogo:busca");
    window.sessionStorage.removeItem("cordial:catalogo:ancora");
  } catch {
    // ignore
  }
  userId = null;
  state = EMPTY;
  emit();
}
