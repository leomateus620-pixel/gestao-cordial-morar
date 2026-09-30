import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Confere a credencial interna guardada no cofre do banco (usada pelos gatilhos e crons).
 * Nunca aceita a chave pública do app.
 */
export async function internalTokenAuthorized(
  admin: SupabaseClient,
  received: string | null | undefined,
): Promise<boolean> {
  if (!received || received.length < 32 || received.startsWith("sb_publishable_")) return false;
  const { data, error } = await admin.rpc("internal_worker_token_matches" as never, { _token: received } as never);
  if (error) {
    console.error("[internal-token] check failed", error.message);
    return false;
  }
  return data === true;
}
