import { createClient } from "@supabase/supabase-js";
import { workerSecrets } from "@/lib/workers/hook-auth";
import { internalTokenAuthorized } from "@/lib/workers/internal-token.server";

/**
 * Autenticação dos gatilhos automáticos da agenda.
 *
 * Aceita o segredo do ambiente (`NOTIFICATION_HOOK_SECRET`) ou o token interno
 * `app_settings.agenda_hook_token`, gerado dentro do banco e usado pelos jobs
 * agendados — assim nenhum segredo precisa ficar escrito no código.
 */

async function constantTimeEquals(received: string | null, expected: string): Promise<boolean> {
  if (!expected) return false;
  const encoder = new TextEncoder();
  const [receivedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(received ?? "")),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(receivedHash);
  const right = new Uint8Array(expectedHash);
  let difference = received === null ? 1 : 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function agendaHookAuthorized(
  received: string | null,
  options: { envSecret?: string; supabaseUrl: string; serviceRoleKey: string },
): Promise<boolean> {
  if (!received || received.startsWith("sb_publishable_")) return false;
  if (options.envSecret && (await constantTimeEquals(received, options.envSecret))) return true;
  for (const secret of workerSecrets()) {
    if (await constantTimeEquals(received, secret)) return true;
  }

  const admin = createClient(options.supabaseUrl, options.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Credencial interna do cofre (crons/gatilhos atuais).
  if (await internalTokenAuthorized(admin, received)) return true;
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "agenda_hook_token")
    .maybeSingle();
  const token = (data as { value?: unknown } | null)?.value;
  if (typeof token !== "string" || !token) return false;
  return constantTimeEquals(received, token);
}
