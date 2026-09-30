import { createFileRoute } from "@tanstack/react-router";
import { workerSecrets } from "@/lib/workers/hook-auth";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildPushPresentation } from "@/lib/push/push-presentation";
import { buildPushSummary, isPushExpired, pushRetryPlan } from "@/lib/push/push-delivery";
import { internalTokenAuthorized } from "@/lib/workers/internal-token.server";

/**
 * Worker de push (Firebase Cloud Messaging HTTP v1).
 *
 * Acordado pelo trigger `notifications_enqueue_push` sempre que uma notificação in-app é criada.
 * Processa `public.push_outbox` e envia o push apenas para os tokens do `user_id` da notificação.
 * Falha de FCM nunca afeta a notificação in-app nem o e-mail.
 */

type OutboxRow = {
  id: string;
  notification_id: string;
  user_id: string;
  attempts: number;
  event_at: string | null;
  tipo: string | null;
  sent_tokens: string[] | null;
};

type NotificationRow = {
  id: string;
  user_id: string;
  tipo: string;
  category: string | null;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  imobiliaria: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

function base64Url(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const buffer = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) buffer[index] = binary.charCodeAt(index);
  return buffer.buffer;
}

async function getAccessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(account.private_key.replace(/\\n/g, "\n")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  const assertion = `${header}.${claims}.${base64Url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error(`Google OAuth falhou [${response.status}]: ${await response.text()}`);
  }
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error("Google OAuth não retornou access_token");
  return payload.access_token;
}

function readServiceAccount(): ServiceAccount | null {
  const raw = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) return null;
    return parsed as ServiceAccount;
  } catch {
    return null;
  }
}


function buildLink(id: string, presentationLink: string): string {
  const separator = presentationLink.includes("?") ? "&" : "?";
  return `${presentationLink}${separator}push=${id}`;
}

type PushMessage = { id: string; title: string; body: string; label: string; category: string; cta: string; tag: string; link: string; extra?: Record<string, string> };

async function sendMessage(
  accessToken: string,
  projectId: string,
  token: string,
  message: PushMessage,
): Promise<{ ok: boolean; unregistered: boolean; error?: string }> {
  const link = buildLink(message.id, message.link);
  const data: Record<string, string> = {
    notification_id: message.id,
    type: message.extra?.['type'] ?? "system",
    category: message.category,
    label: message.label,
    title: message.title,
    body: message.body,
    cta: message.cta,
    tag: message.tag,
    link,
    ...(message.extra ?? {}),
  };
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    // Payload data-only: quem exibe é APENAS o service worker.
    body: JSON.stringify({
      message: { token, data, webpush: { headers: { Urgency: "high" }, fcm_options: { link } } },
    }),
  });
  if (response.ok) return { ok: true, unregistered: false };
  const body = await response.text();
  const unregistered =
    response.status === 404 || (response.status === 400 && body.includes("INVALID_ARGUMENT"));
  return { ok: false, unregistered, error: `[${response.status}] ${body.slice(0, 300)}` };
}

function notificationMessage(notification: NotificationRow): PushMessage {
  const presentation = buildPushPresentation({
    id: notification.id,
    type: notification.tipo,
    category: notification.category,
    titulo: notification.titulo,
    mensagem: notification.mensagem,
    link: notification.link,
    agency: notification.imobiliaria,
    entityType: notification.entity_type,
    entityId: notification.entity_id,
    eventAt: notification.created_at,
  });
  const extra: Record<string, string> = { type: notification.tipo };
  if (notification.imobiliaria) extra['agency'] = notification.imobiliaria;
  if (notification.entity_type) extra['entity_type'] = notification.entity_type;
  if (notification.entity_id) extra['entity_id'] = notification.entity_id;
  return {
    id: notification.id,
    title: presentation.title,
    body: presentation.body,
    label: presentation.label,
    category: presentation.category,
    cta: presentation.ctaLabel,
    tag: presentation.tag,
    link: presentation.link,
    extra,
  };
}

/** Envia para os tokens que ainda não receberam; devolve os que receberam. */
async function deliver(
  admin: SupabaseClient,
  userId: string,
  alreadySent: string[],
  accessToken: string,
  projectId: string,
  message: PushMessage,
): Promise<{ delivered: string[]; errors: string[]; hadTokens: boolean }> {
  const { data: tokens } = await admin.from("user_push_tokens").select("token").eq("user_id", userId);
  const list = (tokens ?? []).map((row) => row.token as string);
  const delivered: string[] = [];
  const errors: string[] = [];
  for (const token of list) {
    if (alreadySent.includes(token)) continue;
    try {
      const result = await sendMessage(accessToken, projectId, token, message);
      if (result.ok) delivered.push(token);
      else {
        if (result.unregistered) await admin.from("user_push_tokens").delete().eq("token", token);
        if (result.error) errors.push(result.error);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "erro desconhecido");
    }
  }
  return { delivered, errors, hadTokens: list.length > 0 };
}

async function markFailure(admin: SupabaseClient, row: OutboxRow, sentTokens: string[], message: string) {
  const attempts = row.attempts + 1;
  const plan = pushRetryPlan(attempts);
  await admin
    .from("push_outbox")
    .update({
      status: plan.status,
      attempts,
      sent_tokens: sentTokens,
      next_attempt_at: plan.nextAttemptAt,
      processed_at: plan.status === "failed_final" ? new Date().toISOString() : null,
      last_error: message.slice(0, 500),
      last_error_at: new Date().toISOString(),
      claimed_at: null,
    } as never)
    .eq("id", row.id);
}

async function processRow(
  admin: SupabaseClient,
  row: OutboxRow,
  accessToken: string,
  projectId: string,
): Promise<"sent" | "skipped" | "failed" | "expired"> {
  const now = new Date().toISOString();
  // Evento velho não vira push individual: entra no resumo único do usuário.
  if (isPushExpired(row.tipo, row.event_at)) {
    await admin
      .from("push_outbox")
      .update({ status: "expired", processed_at: now, claimed_at: null } as never)
      .eq("id", row.id);
    return "expired";
  }

  const { data: notification, error: notificationError } = await admin
    .from("notifications")
    .select("id, user_id, tipo, category, titulo, mensagem, link, imobiliaria, entity_type, entity_id, created_at")
    .eq("id", row.notification_id)
    .maybeSingle<NotificationRow>();
  if (notificationError || !notification) {
    await admin
      .from("push_outbox")
      .update({
        status: "skipped",
        processed_at: now,
        last_error: notificationError?.message ?? "Notificação inexistente",
        last_error_at: now,
      } as never)
      .eq("id", row.id);
    return "skipped";
  }

  const already = row.sent_tokens ?? [];
  const { delivered, errors, hadTokens } = await deliver(
    admin, notification.user_id, already, accessToken, projectId, notificationMessage(notification),
  );
  const sentTokens = [...already, ...delivered];

  if (!hadTokens) {
    await admin
      .from("push_outbox")
      .update({ status: "skipped", processed_at: now, last_error: null, claimed_at: null } as never)
      .eq("id", row.id);
    return "skipped";
  }
  if (errors.length === 0) {
    await admin
      .from("push_outbox")
      .update({
        status: "sent",
        attempts: row.attempts + 1,
        sent_tokens: sentTokens,
        sent_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
        last_error: null,
        claimed_at: null,
      } as never)
      .eq("id", row.id);
    return "sent";
  }
  if (sentTokens.length > 0) {
    // Algum aparelho recebeu: registra como enviado, sem repetir aos que já receberam.
    await admin
      .from("push_outbox")
      .update({
        status: "sent",
        attempts: row.attempts + 1,
        sent_tokens: sentTokens,
        sent_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
        last_error: errors.join(" | ").slice(0, 500),
        last_error_at: new Date().toISOString(),
        claimed_at: null,
      } as never)
      .eq("id", row.id);
    return "sent";
  }
  await markFailure(admin, row, sentTokens, errors.join(" | "));
  return "failed";
}

async function sendSummaries(admin: SupabaseClient, accessToken: string, projectId: string): Promise<number> {
  const { data, error } = await admin.rpc("push_outbox_take_expired" as never);
  if (error) {
    console.error("[push-worker] resumo falhou", error.message);
    return 0;
  }
  let count = 0;
  for (const entry of (data ?? []) as Array<{ user_id: string; summary_id: string; tipos: Record<string, number> }>) {
    const summary = buildPushSummary(entry.tipos ?? {});
    await deliver(admin, entry.user_id, [], accessToken, projectId, {
      id: entry.summary_id,
      title: summary.title,
      body: summary.body,
      label: "Resumo",
      category: "system",
      cta: "Ver notificações",
      tag: `summary:${entry.summary_id}`,
      link: "/",
      extra: { type: "push_resumo" },
    });
    count += 1;
  }
  return count;
}

export const Route = createFileRoute("/api/public/hooks/push-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
        const supabaseUrl = process.env['SUPABASE_URL'];
        const hookSecret = process.env['NOTIFICATION_HOOK_SECRET'];
        if (!serviceRoleKey || !supabaseUrl) {
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }
        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        // Credenciais exclusivas de servidor: a chave pública do app não vale aqui.
        const accepted = [hookSecret, ...workerSecrets()].filter(
          (value): value is string => Boolean(value) && !String(value).startsWith("sb_publishable_"),
        );
        const authorized =
          !!apikey && (accepted.includes(apikey) || (await internalTokenAuthorized(admin, apikey)));
        if (!authorized) return Response.json({ error: "Unauthorized" }, { status: 401 });

        let body: { limit?: number; notification_id?: string; mode?: string } = {};
        try {
          const text = await request.text();
          if (text) body = JSON.parse(text) as typeof body;
        } catch {
          body = {};
        }

        const account = readServiceAccount();
        if (!account) {
          console.warn("FCM não configurado: defina FIREBASE_SERVICE_ACCOUNT_JSON nos secrets.");
          return Response.json({ ok: true, skipped: true, reason: "FCM não configurado" });
        }

        // Autentica ANTES de reservar a fila: falha de auth não deve deixar rows presas.
        let accessToken: string;
        try {
          accessToken = await getAccessToken(account);
        } catch (tokenError) {
          console.error("FCM auth falhou:", tokenError);
          return Response.json({ ok: false, error: "FCM auth falhou" }, { status: 200 });
        }

        const single = typeof body.notification_id === "string" && /^[0-9a-f-]{36}$/i.test(body.notification_id);
        const { data: rows, error } = single
          ? await admin.rpc("push_outbox_claim_one" as never, { _notification_id: body.notification_id } as never)
          : await admin.rpc("push_outbox_claim_due" as never, {
              _limit: Math.min(Math.max(body.limit ?? 25, 1), 100),
            } as never);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const results = { sent: 0, skipped: 0, failed: 0, expired: 0, summaries: 0, alerts: 0 };
        for (const row of (rows ?? []) as OutboxRow[]) {
          try {
            results[await processRow(admin, row, accessToken, account.project_id)] += 1;
          } catch (rowError) {
            results.failed += 1;
            console.error("Push outbox row falhou:", rowError);
            await markFailure(
              admin, row, row.sent_tokens ?? [],
              rowError instanceof Error ? rowError.message : "erro desconhecido",
            );
          }
        }

        // Resumo único dos eventos velhos e alerta de pendência (sempre que houver).
        results.summaries = await sendSummaries(admin, accessToken, account.project_id);
        if (!single) {
          const { data: alerts } = await admin.rpc("push_outbox_stuck_alert" as never);
          results.alerts = typeof alerts === "number" ? alerts : 0;
        }

        return Response.json({ ok: true, processed: (rows as unknown[] | null)?.length ?? 0, ...results });
      },
    },
  },
});
