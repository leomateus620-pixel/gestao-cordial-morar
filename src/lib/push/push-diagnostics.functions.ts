import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const WORKER_URL =
  "https://project--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app/api/public/hooks/push-worker";

export type PushDevice = {
  id: string;
  userAgent: string | null;
  updatedAt: string | null;
};

export type PushDiagnostics = {
  userId: string;
  devices: PushDevice[];
};

/** Lista os dispositivos push do próprio usuário (RLS: só os dele). */
export const getPushDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PushDiagnostics> => {
    const { data, error } = await context.supabase
      .from("user_push_tokens")
      .select("id, user_agent, updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return {
      userId: context.userId,
      devices: (data ?? []).map((row) => ({
        id: row.id as string,
        userAgent: (row.user_agent as string | null) ?? null,
        updatedAt: (row.updated_at as string | null) ?? null,
      })),
    };
  });

async function wakeWorker(): Promise<void> {
  const apikey = process.env['SUPABASE_PUBLISHABLE_KEY'] ?? process.env['NOTIFICATION_HOOK_SECRET'];
  if (!apikey) return;
  try {
    await fetch(WORKER_URL, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 25 }),
    });
  } catch {
    // wake é best-effort; o worker também roda pelo trigger
  }
}

/** Envia notificações de teste para o próprio usuário pelo pipeline normal (in-app + push). */
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ preset: z.enum(["dupla"]).default("dupla") })
      .parse(data ?? {}),
  )
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stamp = new Date().toISOString();
    const rows = [
      {
        user_id: context.userId,
        tipo: "system",
        category: "system",
        titulo: "Teste 01",
        mensagem: "Notificação push de teste do Gestão Cordial.",
        link: "/",
        dedup_key: `push_test_1:${context.userId}:${stamp}`,
      },
      {
        user_id: context.userId,
        // `system` evita a validação de entidade vinculada: é um teste, não há atendimento real.
        tipo: "system",
        category: "system",
        titulo: "Foi vinculado um atendimento a você",
        mensagem: "Abrir?",
        link: "/atendimentos",
        dedup_key: `push_test_2:${context.userId}:${stamp}`,
      },
    ];

    const { error } = await supabaseAdmin.from("notifications").insert(rows);
    if (error) throw new Error(error.message);

    await wakeWorker();
    return { ok: true, sent: rows.length };
  });
