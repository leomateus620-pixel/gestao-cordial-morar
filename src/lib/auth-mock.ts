// Compatibility shim: keeps the original API surface (useSession, login, logout, mockUsers, MockUser)
// but reads from real Lovable Cloud auth (Supabase). The "Mock" naming is kept only to avoid
// touching every existing import site; nothing here is mocked anymore.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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

// Legacy export — no longer carries demo accounts. Kept as empty so any
// `Object.values(mockUsers)` call still compiles and yields a safe empty list.
export const mockUsers: Record<string, MockUser> = {};

type ProfileRow = {
  id: string;
  nome: string;
  email: string;
  cargo: string | null;
  iniciais: string | null;
};

function pickHighestRole(roles: UserProfile[]): UserProfile {
  const order: UserProfile[] = ["admin_owner", "financeiro_admin", "secretaria", "corretor"];
  for (const r of order) if (roles.includes(r)) return r;
  return "corretor";
}

// Map DB enum (app_role) -> existing UserProfile keys used by permissions.
function mapDbRole(role: string): UserProfile {
  switch (role) {
    case "admin":
      return "admin_owner";
    case "financeiro":
      return "financeiro_admin";
    case "secretaria":
      return "secretaria";
    case "corretor":
    default:
      return "corretor";
  }
}

function buildSession(profile: ProfileRow, perfil: UserProfile): MockUser {
  const role = roleDefinitions[perfil];
  return {
    id: profile.id,
    nome: profile.nome,
    iniciais: (profile.iniciais ?? profile.nome.slice(0, 2)).toUpperCase(),
    cargo: profile.cargo ?? role.label,
    perfil,
    perfilLabel: role.label,
    modules: role.modules,
    permissions: role.permissions,
  };
}

async function loadSession(userId: string): Promise<MockUser | null> {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("id,nome,email,cargo,iniciais").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  if (!profile) return null;
  const mapped = (roles ?? []).map((r) => mapDbRole(r.role));
  const perfil = pickHighestRole(mapped.length ? mapped : ["corretor"]);
  return buildSession(profile as ProfileRow, perfil);
}

// Simple subscriber store so all hook instances share one load.
const listeners = new Set<() => void>();
let current: MockUser | null = null;
let ready = false;
let hasAuthSession = false;
let initialized = false;
let profileLoadInFlight = false;

function notify() {
  listeners.forEach((l) => l());
}

async function loadProfileWithRetry(userId: string): Promise<MockUser | null> {
  const delays = [0, 400, 1200];
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) await new Promise((r) => setTimeout(r, delays[i]));
    try {
      const session = await loadSession(userId);
      if (session) return session;
    } catch (err) {
      console.warn("[auth] loadSession attempt failed", i + 1, err);
    }
  }
  return null;
}

async function refresh() {
  if (profileLoadInFlight) return;
  profileLoadInFlight = true;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      hasAuthSession = false;
      current = null;
      ready = true;
      notify();
      return;
    }
    hasAuthSession = true;
    // Mark ready immediately so the shell doesn't kick the user to /login
    // while we're still fetching the profile row.
    ready = true;
    notify();
    const profile = await loadProfileWithRetry(data.session.user.id);
    // Only overwrite `current` when we successfully loaded a profile.
    // A transient DB failure must NOT clear the session and log the user out.
    if (profile) {
      current = profile;
      notify();
    }
  } finally {
    profileLoadInFlight = false;
  }
}

function ensureInitialized() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  supabase.auth.onAuthStateChange((event, session) => {
    // Ignore noisy events that fire on every tab focus / hourly token refresh —
    // they would otherwise re-trigger a profile fetch and briefly blank the UI.
    if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION" || event === "USER_UPDATED") {
      hasAuthSession = !!session;
      return;
    }
    if (!session) {
      hasAuthSession = false;
      current = null;
      ready = true;
      notify();
      return;
    }
    hasAuthSession = true;
    // Defer DB lookup to avoid auth callback deadlocks.
    setTimeout(() => {
      void refresh();
    }, 0);
  });
  void refresh();
}

export function useSession(): MockUser | null {
  const [, force] = useState(0);
  useEffect(() => {
    ensureInitialized();
    const cb = () => force((n) => n + 1);
    listeners.add(cb);
    cb();
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return current;
}

export function useAuthReady(): boolean {
  const [, force] = useState(0);
  useEffect(() => {
    ensureInitialized();
    const cb = () => force((n) => n + 1);
    listeners.add(cb);
    cb();
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return ready;
}

/**
 * Returns whether the Supabase auth session is currently valid.
 * Use this (not `useSession`) for redirect guards — the profile row may
 * still be loading even after the session is confirmed.
 */
export function useHasAuthSession(): boolean {
  const [, force] = useState(0);
  useEffect(() => {
    ensureInitialized();
    const cb = () => force((n) => n + 1);
    listeners.add(cb);
    cb();
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return hasAuthSession;
}

export async function login(
  email: string,
  senha: string,
): Promise<{ user: MockUser | null; error: string | null }> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: senha,
  });
  if (error || !data.user) {
    return { user: null, error: error?.message ?? "Não foi possível entrar." };
  }
  const session = await loadSession(data.user.id);
  current = session;
  ready = true;
  notify();
  return { user: session, error: null };
}

export async function signUp(
  email: string,
  senha: string,
  nome: string,
): Promise<{ ok: boolean; error: string | null }> {
  const redirect = typeof window !== "undefined" ? window.location.origin : undefined;
  const { error } = await supabase.auth.signUp({
    email: email.trim(),
    password: senha,
    options: {
      emailRedirectTo: redirect,
      data: { nome: nome.trim() },
    },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function requestPasswordReset(email: string): Promise<{ ok: boolean; error: string | null }> {
  const redirect =
    typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: redirect,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function logout() {
  await supabase.auth.signOut();
  current = null;
  notify();
}
