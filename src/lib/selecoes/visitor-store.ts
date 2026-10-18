import { useSyncExternalStore } from "react";
import { normalizePublicIds, VISITOR_SELECTION_LIMIT } from "./visitor-rules";

const KEY = "cordial:visitor-selection:v1";
const EMPTY: readonly string[] = Object.freeze([]);
let state: readonly string[] = EMPTY;
let initialized = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}
function read() {
  try {
    return normalizePublicIds(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
  } catch {
    return [];
  }
}
function initialize() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  state = read();
  window.addEventListener("storage", (event) => {
    if (event.key !== KEY && event.key !== null) return;
    state = read();
    emit();
  });
}
function write(ids: readonly string[]) {
  initialize();
  state = normalizePublicIds(ids);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* The draft still works in this tab when storage is unavailable. */
  }
  emit();
}

export const visitorSelection = {
  toggle(id: string): boolean {
    initialize();
    if (state.includes(id)) {
      write(state.filter((value) => value !== id));
      return true;
    }
    if (state.length >= VISITOR_SELECTION_LIMIT || !normalizePublicIds([id]).length) return false;
    write([...state, id]);
    return true;
  },
  remove(id: string) {
    write(state.filter((value) => value !== id));
  },
  move(id: string, delta: number) {
    initialize();
    const next = [...state],
      from = next.indexOf(id),
      to = from + delta;
    if (from < 0 || to < 0 || to >= next.length) return;
    [next[from], next[to]] = [next[to], next[from]];
    write(next);
  },
  clear() {
    write([]);
  },
  get(): readonly string[] {
    initialize();
    return state;
  },
};

export function useVisitorSelection(): { ids: readonly string[] } {
  const ids = useSyncExternalStore(
    (listener) => {
      initialize();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state,
    () => EMPTY,
  );
  return { ids };
}
