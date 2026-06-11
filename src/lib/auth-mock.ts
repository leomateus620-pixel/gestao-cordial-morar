import { useSyncExternalStore } from "react";

export type MockUser = { id: string; nome: string; iniciais: string; cargo: string };

export const mockUsers: Record<string, MockUser & { senha: string }> = {
  ricardo: { id: "ricardo", nome: "Ricardo", iniciais: "RC", cargo: "Sócio-diretor", senha: "cordial" },
  bruna: { id: "bruna", nome: "Bruna", iniciais: "BR", cargo: "Sócia-diretora", senha: "cordial" },
};

const KEY = "gc.session";
const listeners = new Set<() => void>();
let cached: MockUser | null = null;
let hydrated = false;

function readStorage(): MockUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MockUser;
  } catch {
    return null;
  }
}

function emit() {
  cached = readStorage();
  listeners.forEach((l) => l());
}

export function getSession(): MockUser | null {
  if (!hydrated && typeof window !== "undefined") {
    cached = readStorage();
    hydrated = true;
  }
  return cached;
}

export function login(usuario: string, senha: string): MockUser | null {
  const u = mockUsers[usuario.toLowerCase()];
  if (!u || u.senha !== senha) return null;
  const session: MockUser = { id: u.id, nome: u.nome, iniciais: u.iniciais, cargo: u.cargo };
  window.localStorage.setItem(KEY, JSON.stringify(session));
  emit();
  return session;
}

export function logout() {
  window.localStorage.removeItem(KEY);
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useSession(): MockUser | null {
  return useSyncExternalStore(
    subscribe,
    () => getSession(),
    () => null,
  );
}