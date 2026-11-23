import type { ImobiProvider } from "@/lib/imobibrasil/providers";
import { workerCallerSecret } from "@/lib/workers/hook-auth";

export async function assertProviderScope(
  supabase: {
    rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" }) => Promise<{ data: unknown }>;
    from: (t: "user_agencies") => {
      select: (c: string) => {
        eq: (c: string, v: string) => Promise<{ data: Array<{ agency: string }> | null }>;
      };
    };
  },
  userId: string,
  providers: ImobiProvider[],
): Promise<{ isAdmin: boolean }> {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin === true) return { isAdmin: true };
  const { data: agencies } = await supabase
    .from("user_agencies")
    .select("agency")
    .eq("user_id", userId);
  const allowed = new Set((agencies ?? []).map((row) => row.agency));
  const denied = providers.filter((provider) => !allowed.has(provider) && !allowed.has("ambas"));
  if (denied.length) {
    throw new Error(`Sem permissão para publicar em: ${denied.join(", ")}.`);
  }
  return { isAdmin: false };
}

/**
 * Origem pública do app, lida de `app_settings.site_media_worker_origin`.
 *
 * A leitura é feita com um cliente privilegiado porque o RLS de `app_settings`
 * não tem política permissiva: o cliente do usuário não enxerga a linha.
 */
type OriginClient = {
  from: (t: "app_settings") => {
    select: (c: string) => {
      eq: (c: string, v: string) => Promise<{ data: Array<{ value: unknown }> | null }>;
    };
  };
};

async function workerOrigin(supabase: OriginClient): Promise<string | null> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "site_media_worker_origin");
  const value = data?.[0]?.value;
  const origin = typeof value === "string" ? value.trim() : "";
  return /^https:\/\/[^/?#]+\/?$/.test(origin) ? origin.replace(/\/$/, "") : null;
}

export async function kickWorker(supabase: OriginClient) {
  try {
    const secret =
      workerCallerSecret();
    if (!secret) return;
    const origin = await workerOrigin(supabase);
    if (!origin) return;
    // Lote maior + drenagem: o worker repete o ciclo enquanto sobrar job
    // pendente, para a fila não ficar parada esperando o pg_cron.
    // Cadastro e fotos têm workers separados: mídia é lenta e não pode
    // derrubar o request que está publicando o cadastro.
    await fetch(`${origin}/api/public/hooks/property-sync-worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: secret },
      body: JSON.stringify({ limit: 10, drain: true }),
    });
    try {
      await fetch(`${origin}/api/public/hooks/property-media-worker`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: secret },
        body: JSON.stringify({ passes: 2 }),
        signal: AbortSignal.timeout(1500),
      });
    } catch {
      // o cron da fila de fotos processa no próximo ciclo
    }

  } catch {
    // A fila persistente é a garantia; o pg_cron reprocessa no próximo ciclo.
  }
}
