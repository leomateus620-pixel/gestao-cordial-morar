import * as React from "react";
import { render as renderAsync } from "@react-email/components";
import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TEMPLATES } from "@/lib/email-templates/registry";

/**
 * Dispatcher de lembretes da Agenda.
 * Chamado a cada 1 minuto por pg_cron. Autenticado por segredo exclusivo do servidor.
 *
 * Canais: `notification` (in-app) e `email` (enfileirado em `transactional_emails`).
 * Idempotência por (event_id, offset_min, user_id, channel) em `agenda_reminder_deliveries`.
 *
 * O modo `force` só existe em desenvolvimento e exige opt-in explícito no ambiente.
 */

const SITE_NAME = "gestao-cordial-morar";
const SENDER_DOMAIN = "notify.cordialgestao.com";
const FROM_DOMAIN = "cordialgestao.com";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type TestBody = {
  eventId?: string;
  userId?: string;
  offsetMin?: number;
  force?: boolean;
  channels?: Array<"email" | "notification">;
};

type ReminderRow = { antecedencia_min: number; tipo: string; ativo: boolean };
type ParticipantRow = { user_id: string | null };
type AgendaReminderEvent = {
  id: string;
  titulo: string | null;
  tipo: string | null;
  inicio: string;
  local: string | null;
  cliente_nome: string | null;
  imovel_descricao: string | null;
  imobiliaria: "cordial" | "morar" | "ambas";
  owner_user_id: string | null;
  created_by: string | null;
  agenda_event_reminders: ReminderRow[];
  agenda_event_participants: ParticipantRow[];
};
type ReminderProfile = { id: string; nome: string | null; email: string | null };
type DispatchLog = Record<string, unknown>;
type NotificationAgency = "cordial" | "morar" | "ambas";

async function authorizedRecipientsForAgency(
  admin: SupabaseClient,
  candidateIds: string[],
  agency: NotificationAgency,
): Promise<string[]> {
  if (candidateIds.length === 0) return [];
  const { data, error } = await admin
    .from("user_agencies")
    .select("user_id, agency")
    .in("user_id", candidateIds);
  if (error) throw new Error(`Recipient scope lookup failed: ${error.message}`);
  const allowed = new Set(
    (data ?? [])
      .filter((membership) => agency === "ambas" || membership.agency === agency)
      .map((membership) => membership.user_id as string),
  );
  return candidateIds.filter((userId) => allowed.has(userId));
}

async function secretMatches(received: string | null, expected: string): Promise<boolean> {
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

export const Route = createFileRoute("/api/public/hooks/agenda-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const hookSecret = process.env.NOTIFICATION_HOOK_SECRET;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = process.env.SUPABASE_URL;

        if (!hookSecret || !serviceRoleKey || !supabaseUrl) {
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        if (!(await secretMatches(apikey, hookSecret))) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let body: TestBody = {};
        try {
          const text = await request.text();
          if (text) {
            const parsed: unknown = JSON.parse(text);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              body = parsed as TestBody;
            }
          }
        } catch {
          body = {};
        }

        const forceAllowed =
          process.env.NODE_ENV !== "production" &&
          process.env.ALLOW_NOTIFICATION_HOOK_FORCE === "true";
        const manualFields: Array<keyof TestBody> = [
          "eventId",
          "userId",
          "offsetMin",
          "channels",
          "force",
        ];
        const hasManualOverride = manualFields.some((field) =>
          Object.prototype.hasOwnProperty.call(body, field),
        );
        const hasManualTarget = ["eventId", "userId", "offsetMin", "channels"].some((field) =>
          Object.prototype.hasOwnProperty.call(body, field),
        );
        if (hasManualOverride && !forceAllowed) {
          return Response.json({ error: "Manual override is disabled" }, { status: 403 });
        }
        if (hasManualTarget && body.force !== true) {
          return Response.json({ error: "Manual targeting requires force" }, { status: 400 });
        }

        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const now = new Date();
        const wantChannels = new Set<"email" | "notification">(
          body.channels && body.channels.length ? body.channels : ["notification", "email"],
        );
        const force = body.force === true && forceAllowed;

        // Query events.
        let eventsQuery = admin
          .from("agenda_events")
          .select(
            "id, titulo, tipo, inicio, local, cliente_nome, imovel_descricao, imobiliaria, owner_user_id, created_by, agenda_event_reminders(antecedencia_min, tipo, ativo), agenda_event_participants(user_id)",
          )
          .is("deleted_at", null);

        if (body.eventId) {
          eventsQuery = eventsQuery.eq("id", body.eventId);
        } else {
          const upperBound = new Date(now.getTime() + 25 * 60 * 60 * 1000);
          eventsQuery = eventsQuery
            .gte("inicio", now.toISOString())
            .lte("inicio", upperBound.toISOString());
        }

        const { data: events, error: eventsErr } = await eventsQuery;
        if (eventsErr) {
          console.error("[agenda-reminders] events fetch failed", eventsErr);
          return Response.json({ error: eventsErr.message }, { status: 500 });
        }

        const dispatched: Array<{
          eventId: string;
          offsetMin: number;
          userId: string;
          channel: string;
        }> = [];
        const skipped: Array<{
          eventId: string;
          offsetMin: number;
          userId?: string;
          channel?: string;
          reason: string;
        }> = [];

        for (const ev of (events ?? []) as AgendaReminderEvent[]) {
          const inicioMs = new Date(ev.inicio as string).getTime();
          let reminders = (ev.agenda_event_reminders ?? []).filter(
            (reminder) =>
              reminder.ativo &&
              reminder.tipo === "interno" &&
              typeof reminder.antecedencia_min === "number",
          );
          if (typeof body.offsetMin === "number") {
            reminders = reminders.filter(
              (reminder) => reminder.antecedencia_min === body.offsetMin,
            );
            if (reminders.length === 0) {
              reminders = [{ antecedencia_min: body.offsetMin, tipo: "interno", ativo: true }];
            }
          }

          for (const r of reminders) {
            const fireAt = inicioMs - r.antecedencia_min * 60_000;
            if (
              !force &&
              (fireAt < now.getTime() - 6 * 60_000 || fireAt > now.getTime() + 60_000)
            ) {
              continue;
            }

            const recipientSet = new Set<string>();
            if (body.userId) {
              recipientSet.add(body.userId);
            } else {
              if (ev.owner_user_id) recipientSet.add(ev.owner_user_id as string);
              if (ev.created_by) recipientSet.add(ev.created_by as string);
              for (const p of ev.agenda_event_participants ?? []) {
                if (p.user_id) recipientSet.add(p.user_id as string);
              }
            }

            // Load profiles for recipients (name + email).
            const candidates = Array.from(recipientSet);
            const recipientIds = await authorizedRecipientsForAgency(
              admin,
              candidates,
              ev.imobiliaria,
            );
            for (const deniedUserId of candidates.filter(
              (userId) => !recipientIds.includes(userId),
            )) {
              skipped.push({
                eventId: ev.id,
                offsetMin: r.antecedencia_min,
                userId: deniedUserId,
                reason: "agency_scope",
              });
            }
            const { data: profiles } = await admin
              .from("profiles")
              .select("id, nome, email")
              .in("id", recipientIds);
            const profileById = new Map<
              string,
              { id: string; nome: string | null; email: string | null }
            >();
            for (const profile of (profiles ?? []) as ReminderProfile[]) {
              profileById.set(profile.id, profile);
            }

            for (const userId of recipientIds) {
              const prof = profileById.get(userId);

              // --- Channel: notification ---
              if (wantChannels.has("notification")) {
                await dispatchNotification({
                  admin,
                  ev,
                  offsetMin: r.antecedencia_min,
                  userId,
                  force,
                  dispatched,
                  skipped,
                });
              }

              // --- Channel: email ---
              if (wantChannels.has("email")) {
                await dispatchEmail({
                  admin,
                  ev,
                  offsetMin: r.antecedencia_min,
                  userId,
                  email: prof?.email ?? null,
                  nome: prof?.nome ?? null,
                  force,
                  dispatched,
                  skipped,
                });
              }
            }
          }
        }

        return Response.json({
          ok: true,
          scanned: events?.length ?? 0,
          dispatched,
          skipped,
          at: now.toISOString(),
        });
      },
      GET: async () =>
        Response.json({ ok: true, hint: "Agenda reminder dispatcher is available." }),
    },
  },
});

async function dispatchNotification(args: {
  admin: SupabaseClient;
  ev: AgendaReminderEvent;
  offsetMin: number;
  userId: string;
  force: boolean;
  dispatched: DispatchLog[];
  skipped: DispatchLog[];
}) {
  const { admin, ev, offsetMin, userId, force, dispatched, skipped } = args;
  if (!force) {
    const { data: already } = await admin
      .from("agenda_reminder_deliveries")
      .select("event_id")
      .eq("event_id", ev.id)
      .eq("offset_min", offsetMin)
      .eq("user_id", userId)
      .eq("channel", "notification")
      .maybeSingle();
    if (already) {
      skipped.push({
        eventId: ev.id,
        offsetMin,
        userId,
        channel: "notification",
        reason: "already_delivered",
      });
      return;
    }
  }

  const label = labelAntecedencia(offsetMin);
  const titulo = (ev.titulo ?? "").trim() || "Compromisso";
  const inicioFmt = formatData(ev.inicio);
  const mensagem = [
    inicioFmt ? `Início: ${inicioFmt}` : null,
    ev.local ? `Local: ${ev.local}` : null,
    ev.cliente_nome ? `Cliente: ${ev.cliente_nome}` : null,
    ev.imovel_descricao ? `Imóvel: ${ev.imovel_descricao}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const { error: notifErr } = await admin.from("notifications").insert({
    user_id: userId,
    tipo: "agenda_lembrete",
    titulo: `Lembrete: ${titulo} ${label}`,
    mensagem: mensagem || null,
    link: `/agenda?id=${ev.id}`,
    lida: false,
    category: "agenda",
    imobiliaria: ev.imobiliaria,
    entity_type: "agenda_event",
    entity_id: ev.id,
    dedup_key: `agenda:${ev.id}:${offsetMin}:${userId}${force ? `:${Date.now()}` : ""}`,
    metadata: { event_id: ev.id, offset_min: offsetMin, inicio: ev.inicio },
  });

  if (notifErr) {
    console.error("[agenda-reminders] notification insert failed", notifErr);
    skipped.push({
      eventId: ev.id,
      offsetMin,
      userId,
      channel: "notification",
      reason: notifErr.message,
    });
    return;
  }

  const { error: deliveryError } = await admin.from("agenda_reminder_deliveries").insert({
    event_id: ev.id,
    offset_min: offsetMin,
    user_id: userId,
    channel: "notification",
  });
  if (deliveryError) {
    console.error("[agenda-reminders] notification delivery tracking failed", deliveryError);
    skipped.push({
      eventId: ev.id,
      offsetMin,
      userId,
      channel: "notification",
      reason: `delivered_but_tracking_failed: ${deliveryError.message}`,
    });
    return;
  }
  dispatched.push({ eventId: ev.id, offsetMin, userId, channel: "notification" });
}

async function dispatchEmail(args: {
  admin: SupabaseClient;
  ev: AgendaReminderEvent;
  offsetMin: number;
  userId: string;
  email: string | null;
  nome: string | null;
  force: boolean;
  dispatched: DispatchLog[];
  skipped: DispatchLog[];
}) {
  const { admin, ev, offsetMin, userId, email, nome, force, dispatched, skipped } = args;
  if (!email) {
    skipped.push({
      eventId: ev.id,
      offsetMin,
      userId,
      channel: "email",
      reason: "no_email_on_profile",
    });
    return;
  }

  if (!force) {
    const { data: already } = await admin
      .from("agenda_reminder_deliveries")
      .select("event_id")
      .eq("event_id", ev.id)
      .eq("offset_min", offsetMin)
      .eq("user_id", userId)
      .eq("channel", "email")
      .maybeSingle();
    if (already) {
      skipped.push({
        eventId: ev.id,
        offsetMin,
        userId,
        channel: "email",
        reason: "already_delivered",
      });
      return;
    }
  }

  const normalizedEmail = email.toLowerCase();

  // Suppression check.
  const { data: suppressed } = await admin
    .from("suppressed_emails")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();
  if (suppressed) {
    skipped.push({ eventId: ev.id, offsetMin, userId, channel: "email", reason: "suppressed" });
    return;
  }

  // Unsubscribe token (reuse or create).
  let unsubscribeToken: string;
  const { data: existingToken } = await admin
    .from("email_unsubscribe_tokens")
    .select("token, used_at")
    .eq("email", normalizedEmail)
    .maybeSingle();
  if (existingToken && !existingToken.used_at) {
    unsubscribeToken = existingToken.token as string;
  } else if (!existingToken) {
    unsubscribeToken = generateToken();
    await admin
      .from("email_unsubscribe_tokens")
      .upsert(
        { token: unsubscribeToken, email: normalizedEmail },
        { onConflict: "email", ignoreDuplicates: true },
      );
    const { data: storedToken } = await admin
      .from("email_unsubscribe_tokens")
      .select("token")
      .eq("email", normalizedEmail)
      .maybeSingle();
    unsubscribeToken = (storedToken?.token as string) ?? unsubscribeToken;
  } else {
    skipped.push({ eventId: ev.id, offsetMin, userId, channel: "email", reason: "unsubscribed" });
    return;
  }

  const templateName = "agenda-reminder";
  const template = TEMPLATES[templateName];
  if (!template) {
    skipped.push({
      eventId: ev.id,
      offsetMin,
      userId,
      channel: "email",
      reason: "template_missing",
    });
    return;
  }

  const templateData = {
    destinatarioNome: nome ?? "",
    eventoTitulo: (ev.titulo as string) ?? "",
    eventoTipo: (ev.tipo as string) ?? "",
    inicioIso: ev.inicio as string,
    local: (ev.local as string) ?? "",
    clienteNome: (ev.cliente_nome as string) ?? "",
    imovelDescricao: (ev.imovel_descricao as string) ?? "",
    offsetMin,
    link: `https://cordialgestao.com/agenda?id=${ev.id}`,
  };

  const element = React.createElement(
    template.component as React.ComponentType<typeof templateData>,
    templateData,
  );
  const html = await renderAsync(element);
  const plainText = await renderAsync(element, { plainText: true });
  const resolvedSubject =
    typeof template.subject === "function" ? template.subject(templateData) : template.subject;

  const idempotencyKey = `agenda-${ev.id}-${offsetMin}-${userId}${force ? `-${Date.now()}` : ""}`;
  const messageId = idempotencyKey;

  const { error: claimError } = await admin.from("email_dispatch_claims").insert({
    claim_key: idempotencyKey,
    source: "agenda_reminder",
    status: "pending",
  });
  if (claimError) {
    const duplicate = claimError.code === "23505";
    if (!duplicate) console.error("[agenda-reminders] email claim failed", claimError);
    skipped.push({
      eventId: ev.id,
      offsetMin,
      userId,
      channel: "email",
      reason: duplicate ? "already_claimed" : `email_claim_failed: ${claimError.message}`,
    });
    return;
  }

  const { error: pendingLogError } = await admin.from("email_send_log").insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: email,
    status: "pending",
  });
  if (pendingLogError) {
    console.error("[agenda-reminders] pending email log failed", pendingLogError);
    await admin.from("email_dispatch_claims").delete().eq("claim_key", idempotencyKey);
    skipped.push({
      eventId: ev.id,
      offsetMin,
      userId,
      channel: "email",
      reason: `email_log_failed: ${pendingLogError.message}`,
    });
    return;
  }

  const { error: enqueueError } = await admin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      to: email,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: resolvedSubject,
      html,
      text: plainText,
      purpose: "transactional",
      label: templateName,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  });

  if (enqueueError) {
    console.error("[agenda-reminders] enqueue failed", enqueueError);
    await admin
      .from("email_dispatch_claims")
      .update({
        status: "failed",
        error_message: enqueueError.message,
        updated_at: new Date().toISOString(),
      })
      .eq("claim_key", idempotencyKey);
    const { error: failureLogError } = await admin
      .from("email_send_log")
      .update({ status: "failed", error_message: enqueueError.message })
      .eq("message_id", messageId);
    if (failureLogError) {
      console.error("[agenda-reminders] failed email status update failed", failureLogError);
    }
    skipped.push({
      eventId: ev.id,
      offsetMin,
      userId,
      channel: "email",
      reason: enqueueError.message,
    });
    return;
  }

  const { error: queuedClaimError } = await admin
    .from("email_dispatch_claims")
    .update({ status: "queued", error_message: null, updated_at: new Date().toISOString() })
    .eq("claim_key", idempotencyKey);
  if (queuedClaimError) {
    console.error("[agenda-reminders] queued email claim update failed", queuedClaimError);
  }

  const { error: deliveryError } = await admin.from("agenda_reminder_deliveries").insert({
    event_id: ev.id,
    offset_min: offsetMin,
    user_id: userId,
    channel: "email",
  });
  if (deliveryError) {
    console.error("[agenda-reminders] email delivery tracking failed", deliveryError);
    skipped.push({
      eventId: ev.id,
      offsetMin,
      userId,
      channel: "email",
      reason: `queued_but_tracking_failed: ${deliveryError.message}`,
    });
    return;
  }
  dispatched.push({ eventId: ev.id, offsetMin, userId, channel: "email" });
}

function labelAntecedencia(min: number): string {
  if (min >= 1440) {
    const d = Math.round(min / 1440);
    return `em ${d} dia${d === 1 ? "" : "s"}`;
  }
  if (min >= 60) {
    const h = Math.round(min / 60);
    return `em ${h} hora${h === 1 ? "" : "s"}`;
  }
  return `em ${min} minutos`;
}

function formatData(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return "";
  }
}
