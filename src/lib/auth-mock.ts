import { useSyncExternalStore } from "react";
import {
  roleDefinitions,
  type AppModule,
  type Permission,
  type UserProfile,
} from "@/lib/mock/permissions";

export type MockUser = {
  id: string;
  nome: string;
  iniciais: string;
  cargo: string;
  perfil: UserProfile;
  perfilLabel: string;
  modules: AppModule[];
  permissions: Permission[];
};

type MockUserWithPassword = Omit<MockUser, "perfilLabel" | "modules" | "permissions"> & {
  senha: string;
};

const withProfile = (
  user: MockUserWithPassword,
): MockUserWithPassword & Pick<MockUser, "perfilLabel" | "modules" | "permissions"> => ({
  ...user,
  perfilLabel: roleDefinitions[user.perfil].label,
  modules: roleDefinitions[user.perfil].modules,
  permissions: roleDefinitions[user.perfil].permissions,
});

export const mockUsers: Record<
  string,
  MockUserWithPassword & Pick<MockUser, "perfilLabel" | "modules" | "permissions">
> = {
  ricardo: withProfile({
    id: "ricardo",
    nome: "Ricardo",
    iniciais: "RC",
    cargo: "Sócio-diretor",
    perfil: "admin_owner",
    senha: "cordial",
  }),
  bruna: withProfile({
    id: "bruna",
    nome: "Bruna",
    iniciais: "BR",
    cargo: "Sócia-diretora",
    perfil: "admin_owner",
    senha: "cordial",
  }),
  clara: withProfile({
    id: "clara",
    nome: "Clara",
    iniciais: "CL",
    cargo: "Secretária",
    perfil: "secretaria",
    senha: "cordial",
  }),
  marcos: withProfile({
    id: "marcos",
    nome: "Marcos",
    iniciais: "ML",
    cargo: "Corretor",
    perfil: "corretor",
    senha: "cordial",
  }),
  daniela: withProfile({
    id: "daniela",
    nome: "Daniela",
    iniciais: "DA",
    cargo: "Financeiro/Administrativo",
    perfil: "financeiro_admin",
    senha: "cordial",
  }),
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
  const session: MockUser = {
    id: u.id,
    nome: u.nome,
    iniciais: u.iniciais,
    cargo: u.cargo,
    perfil: u.perfil,
    perfilLabel: u.perfilLabel,
    modules: u.modules,
    permissions: u.permissions,
  };
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
