import { useEffect, useSyncExternalStore } from "react";

/**
 * Lets a page take over the top-bar search while it is mounted, so the page
 * doesn't need a second search field. Only one page owns it at a time.
 */
export type PageSearch = {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
};

let current: PageSearch | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePageSearch(): PageSearch | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

/** Registers the page search while the calling component is mounted. */
export function useRegisterPageSearch(search: PageSearch) {
  const { placeholder, value, onChange } = search;
  useEffect(() => {
    current = { placeholder, value, onChange };
    emit();
  }, [placeholder, value, onChange]);
  useEffect(
    () => () => {
      current = null;
      emit();
    },
    [],
  );
}
