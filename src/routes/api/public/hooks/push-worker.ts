import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
};

type NotificationRow = {
  id: string;
  user_id: string;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
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

async function sendToToken(
  accessToken: string,
  projectId: string,
  token: string,
  notification: NotificationRow,
): Promise<{ ok: boolean; unregistered: boolean; error?: string }> {
  const data: Record<string, string> = {
    notification_id: notification.id,
    link: notification.link ?? "/",
  };
  if (notification.entity_type) data['entity_type'] = notification.entity_type;
  if (notification.entity_id) data['entity_id'] = notification.entity_id;

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: notification.titulo,
            body: notification.mensagem ?? "",
          },
          data,
          webpush: {
            fcm_options: { link: notification.link ?? "/" },
          },
        },
      }),
    },
  );

  if (response.ok) return { ok: true, unregistered: false };
  const body = await response.text();
  const unregistered =
    response.status === 404 || (response.status === 400 && body.includes("INVALID_ARGUMENT"));
  return { ok: false, unregistered, error: `[${response.status}] ${body.slice(0, 300)}` };
}

async function processRow(
  admin: SupabaseClient,
  row: OutboxRow,
  accessToken: string,
  projectId: string,
): Promise<"sent" | "skipped" | "failed"> {
  const { data: notification, error: notificationError } = await admin
    .from("notifications")
    .select("id, user_id, titulo, mensagem, link, entity_type, entity_id")
    .eq("id", row.notification_id)
    .maybeSingle<NotificationRow>();

  if (notificationError || !notification) {
    await admin
      .from("push_outbox")
      .update({
        status: "skipped",
        processed_at: new Date().toISOString(),
        last_error: notificationError?.message ?? "Notificação inexistente",
      })
      .eq("id", row.id);
    return "skipped";
  }

  const { data: tokens } = await admin
    .from("user_push_tokens")
    .select("token")
    .eq("user_id", notification.user_id);

  if (!tokens || tokens.length === 0) {
    await admin
      .from("push_outbox")
      .update({ status: "skipped", processed_at: new Date().toISOString(), last_error: null })
      .eq("id", row.id);
    return "skipped";
  }

  const errors: string[] = [];
  let delivered = 0;
  for (const entry of tokens) {
    const token = entry.token as string;
    try {
      const result = await sendToToken(accessToken, projectId, token, notification);
      if (result.ok) delivered += 1;
      else {
        if (result.unregistered) {
          await admin.from("user_push_tokens").delete().eq("token", token);
        }
        if (result.error) errors.push(result.error);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "erro desconhecido");
    }
  }

  const status = delivered > 0 ? "sent" : errors.length > 0 ? "failed" : "skipped";
  await admin
    .from("push_outbox")
    .update({
      status,
      attempts: row.attempts + 1,
      processed_at: new Date().toISOString(),
      last_error: errors.length > 0 ? errors.join(" | ").slice(0, 500) : null,
    })
    .eq("id", row.id);
  return status;
}

export const Route = createFileRoute("/api/public/hooks/push-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
        const supabaseUrl = process.env['SUPABASE_URL'];
        const publishableKey = process.env['SUPABASE_PUBLISHABLE_KEY'];
        const hookSecret = process.env['NOTIFICATION_HOOK_SECRET'];
        if (!serviceRoleKey || !supabaseUrl) {
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        const authorized =
          (!!publishableKey && apikey === publishableKey) ||
          (!!hookSecret && apikey === hookSecret);
        if (!authorized) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const account = readServiceAccount();
        if (!account) {
          console.warn("FCM não configurado: defina FIREBASE_SERVICE_ACCOUNT_JSON nos secrets.");
          return Response.json({ ok: true, skipped: true, reason: "FCM não configurado" });
        }

        let body: { limit?: number } = {};
        try {
          const text = await request.text();
          if (text) body = JSON.parse(text) as { limit?: number };
        } catch {
          body = {};
        }
        const limit = Math.min(Math.max(body.limit ?? 25, 1), 100);

        const { data: rows, error } = await admin
          .from("push_outbox")
          .select("id, notification_id, user_id, attempts")
          .eq("status", "pending")
          .lt("attempts", 3)
          .order("created_at", { ascending: true })
          .limit(limit);

        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!rows || rows.length === 0) return Response.json({ ok: true, processed: 0 });

        let accessToken: string;
        try {
          accessToken = await getAccessToken(account);
        } catch (tokenError) {
          console.error("FCM auth falhou:", tokenError);
          return Response.json({ ok: false, error: "FCM auth falhou" }, { status: 200 });
        }

        const results = { sent: 0, skipped: 0, failed: 0 };
        for (const row of rows as OutboxRow[]) {
          try {
            const status = await processRow(admin, row, accessToken, account.project_id);
            results[status] += 1;
          } catch (rowError) {
            results.failed += 1;
            console.error("Push outbox row falhou:", rowError);
          }
        }

        return Response.json({ ok: true, processed: rows.length, ...results });
      },
    },
  },
});
