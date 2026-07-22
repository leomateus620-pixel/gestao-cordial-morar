// SERVER ONLY. Do not import from client-reachable modules at top level.
// Holds Google OAuth + Calendar API helpers and per-user sync logic.
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

function clientId() {
  const v = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!v) throw new Error("GOOGLE_OAUTH_CLIENT_ID não configurado");
  return v;
}
function clientSecret() {
  const v = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!v) throw new Error("GOOGLE_OAUTH_CLIENT_SECRET não configurado");
  return v;
}
function stateSecret() {
  const v = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!v) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente");
  return v;
}

export function getRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/public/google-calendar/callback`;
}

function b64url(buf: Buffer | string) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

export function signState(payload: { userId: string; origin: string }) {
  const body = { ...payload, exp: Date.now() + 10 * 60 * 1000 };
  const json = b64url(JSON.stringify(body));
  const sig = b64url(createHmac("sha256", stateSecret()).update(json).digest());
  return `${json}.${sig}`;
}
export function verifyState(token: string): { userId: string; origin: string } {
  const [json, sig] = token.split(".");
  if (!json || !sig) throw new Error("state inválido");
  const expected = b64url(createHmac("sha256", stateSecret()).update(json).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("state assinatura inválida");
  const data = JSON.parse(b64urlDecode(json).toString("utf8")) as {
    userId: string;
    origin: string;
    exp: number;
  };
  if (Date.now() > data.exp) throw new Error("state expirado");
  return { userId: data.userId, origin: data.origin };
}

export function buildAuthUrl(state: string, origin: string) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId());
  url.searchParams.set("redirect_uri", getRedirectUri(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

export async function exchangeCode(code: string, origin: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: getRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange falhou: ${res.status} ${await res.text()}`);
  return res.json();
}

async function refreshAccessToken(refresh_token: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Refresh token falhou: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getUserinfo(accessToken: string): Promise<{ email: string }> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Userinfo falhou: ${res.status}`);
  return res.json();
}

export async function revokeToken(token: string) {
  try {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" });
  } catch {
    // Ignore — apagamos a linha mesmo assim.
  }
}

type ConnectionRow = {
  user_id: string;
  google_email: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  calendar_id: string;
  scope: string | null;
};

async function getValidAccessToken(conn: ConnectionRow): Promise<string> {
  const expires = new Date(conn.expires_at).getTime();
  if (expires - 60_000 > Date.now()) return conn.access_token;
  const refreshed = await refreshAccessToken(conn.refresh_token);
  const newExpires = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabaseAdmin
    .from("google_calendar_connections")
    .update({
      access_token: refreshed.access_token,
      expires_at: newExpires,
      last_error: null,
    })
    .eq("user_id", conn.user_id);
  return refreshed.access_token;
}

async function notify(userId: string, titulo: string, mensagem: string, tipo = "google_calendar") {
  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    tipo,
    titulo,
    mensagem,
    link: "/configuracoes",
  });
}

type ReminderRow = { tipo: string; antecedencia_min: number; ativo: boolean };
type GuestRow = { email: string; nome: string | null; response_status: string | null };

type EventRow = {
  id: string;
  titulo: string;
  descricao: string | null;
  observacoes: string | null;
  tipo: string | null;
  inicio: string;
  fim: string | null;
  duracao_min: number | null;
  dia_inteiro: boolean;
  local: string | null;
  cliente_nome: string | null;
  imovel_descricao: string | null;
  owner_user_id: string | null;
  created_by: string;
  responsavel_nome: string | null;
  criado_por_nome: string | null;
  status: string;
  deleted_at: string | null;
  google_event_id: string | null;
  agenda_event_reminders: ReminderRow[];
  agenda_event_guests: GuestRow[];
  agenda_event_participants?: { user_id: string }[];
};

const TIMEZONE = "America/Sao_Paulo";

const TIPO_LABEL: Record<string, string> = {
  visita: "Visita",
  fotos: "Fotos do imóvel",
  video: "Vídeo do imóvel",
  assinatura: "Assinatura de contrato",
  reuniao: "Reunião",
  retorno: "Retorno para cliente",
  vistoria: "Vistoria",
  captacao: "Captação/Agenciamento",
  interno: "Compromisso interno",
  outro: "Outro",
};

function buildEventPayload(ev: EventRow, extraAttendeeEmails: string[] = []) {
  const startISO = ev.inicio;
  const endISO =
    ev.fim ??
    new Date(
      new Date(ev.inicio).getTime() + Math.max(1, ev.duracao_min ?? 60) * 60_000,
    ).toISOString();

  const tipoLabel = ev.tipo ? TIPO_LABEL[ev.tipo] ?? ev.tipo : null;
  const inviter = ev.responsavel_nome || ev.criado_por_nome || null;

  const descricaoParts = [
    ev.descricao,
    tipoLabel ? `Tipo: ${tipoLabel}` : null,
    inviter ? `Convidado por: ${inviter}` : null,
    ev.cliente_nome ? `Cliente: ${ev.cliente_nome}` : null,
    ev.imovel_descricao ? `Imóvel: ${ev.imovel_descricao}` : null,
    ev.observacoes ? `Obs.: ${ev.observacoes}` : null,
    "— sincronizado pelo Gestão Cordial",
  ].filter(Boolean);

  const overrides = (ev.agenda_event_reminders ?? [])
    .filter((r) => r.ativo)
    .slice(0, 5)
    .map((r) => ({
      method: r.tipo === "email" ? "email" : "popup",
      minutes: Math.max(0, Math.min(40320, r.antecedencia_min)),
    }));

  const attendeeEmails = new Set<string>();
  const attendees: Array<{ email: string; displayName?: string }> = [];
  for (const g of ev.agenda_event_guests ?? []) {
    if (!g.email) continue;
    const key = g.email.toLowerCase();
    if (attendeeEmails.has(key)) continue;
    attendeeEmails.add(key);
    attendees.push({ email: g.email, ...(g.nome ? { displayName: g.nome } : {}) });
  }
  for (const email of extraAttendeeEmails) {
    if (!email) continue;
    const key = email.toLowerCase();
    if (attendeeEmails.has(key)) continue;
    attendeeEmails.add(key);
    attendees.push({ email });
  }

  const base: Record<string, unknown> = {
    summary: ev.titulo,
    description: descricaoParts.join("\n"),
    location: ev.local ?? undefined,
    reminders: overrides.length
      ? { useDefault: false, overrides }
      : { useDefault: true },
    status: ev.status === "cancelado" ? "cancelled" : "confirmed",
  };

  if (attendees.length) {
    base.attendees = attendees;
    base.guestsCanInviteOthers = false;
    base.guestsCanModify = false;
  }

  if (ev.dia_inteiro) {
    base.start = { date: startISO.slice(0, 10) };
    base.end = { date: endISO.slice(0, 10) };
  } else {
    base.start = { dateTime: startISO, timeZone: TIMEZONE };
    base.end = { dateTime: endISO, timeZone: TIMEZONE };
  }
  return base;
}

async function callCalendar(
  accessToken: string,
  calendarId: string,
  path: string,
  init: RequestInit,
) {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId,
  )}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  return res;
}

async function loadEvent(eventId: string): Promise<EventRow | null> {
  const { data, error } = await supabaseAdmin
    .from("agenda_events")
    .select(
      "id,titulo,descricao,observacoes,tipo,inicio,fim,duracao_min,dia_inteiro,local,cliente_nome,imovel_descricao,owner_user_id,created_by,responsavel_nome,criado_por_nome,status,deleted_at,google_event_id,agenda_event_reminders(tipo,antecedencia_min,ativo),agenda_event_guests(email,nome,response_status),agenda_event_participants(user_id)",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as EventRow;
}

function collectRecipientIds(ev: EventRow): string[] {
  const set = new Set<string>();
  if (ev.owner_user_id) set.add(ev.owner_user_id);
  if (ev.created_by) set.add(ev.created_by);
  for (const p of ev.agenda_event_participants ?? []) {
    if (p.user_id) set.add(p.user_id);
  }
  return [...set];
}

type SyncRow = { user_id: string; google_event_id: string; calendar_id: string };

async function syncSingleRecipient(
  ev: EventRow,
  conn: ConnectionRow,
  existing: SyncRow | null,
  extraAttendeeEmails: string[],
): Promise<{ ok: true; googleEventId: string | null } | { ok: false; error: string }> {
  try {
    const accessToken = await getValidAccessToken(conn);
    const calendarId = conn.calendar_id || "primary";
    const hasGuests =
      (ev.agenda_event_guests ?? []).length > 0 || extraAttendeeEmails.length > 0;
    const sendUpdates = hasGuests ? "all" : "none";

    if (ev.status === "cancelado" || ev.deleted_at) {
      if (existing?.google_event_id) {
        const res = await callCalendar(
          accessToken,
          existing.calendar_id || calendarId,
          `/events/${encodeURIComponent(existing.google_event_id)}?sendUpdates=${sendUpdates}`,
          { method: "DELETE" },
        );
        if (!res.ok && res.status !== 404 && res.status !== 410) {
          return { ok: false, error: `DELETE ${res.status}: ${await res.text()}` };
        }
      }
      return { ok: true, googleEventId: null };
    }

    const payload = buildEventPayload(ev, extraAttendeeEmails);
    let googleEventId = existing?.google_event_id ?? null;

    if (googleEventId) {
      const res = await callCalendar(
        accessToken,
        existing?.calendar_id || calendarId,
        `/events/${encodeURIComponent(googleEventId)}?sendUpdates=${sendUpdates}`,
        { method: "PATCH", body: JSON.stringify(payload) },
      );
      if (res.status === 404 || res.status === 410) {
        googleEventId = null;
      } else if (!res.ok) {
        return { ok: false, error: `PATCH ${res.status}: ${await res.text()}` };
      }
    }
    if (!googleEventId) {
      const res = await callCalendar(accessToken, calendarId, `/events?sendUpdates=${sendUpdates}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, error: `POST ${res.status}: ${await res.text()}` };
      const json = (await res.json()) as { id: string };
      googleEventId = json.id;
    }
    return { ok: true, googleEventId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Sincroniza o evento para o Google Calendar de TODOS os envolvidos:
 * owner_user_id, created_by e cada participante (agenda_event_participants).
 * Cada destinatário conectado recebe sua própria cópia, rastreada em
 * agenda_event_google_syncs (event_id, user_id → google_event_id).
 */
export async function syncAgendaEventToGoogle(eventId: string): Promise<{
  status: "sincronizado" | "nao_sincronizado" | "preparado";
  error?: string;
}> {
  const event = await loadEvent(eventId);
  if (!event) return { status: "preparado", error: "Evento não encontrado" };

  const recipientIds = collectRecipientIds(event);
  if (recipientIds.length === 0) {
    await supabaseAdmin
      .from("agenda_events")
      .update({ google_calendar_sync_status: "nao_sincronizado" })
      .eq("id", eventId);
    return { status: "nao_sincronizado" };
  }

  const { data: conns } = await supabaseAdmin
    .from("google_calendar_connections")
    .select("user_id,google_email,access_token,refresh_token,expires_at,calendar_id,scope")
    .in("user_id", recipientIds);

  const connByUser = new Map<string, ConnectionRow>();
  for (const c of (conns ?? []) as ConnectionRow[]) connByUser.set(c.user_id, c);

  const extraAttendeeEmails = [...connByUser.values()]
    .map((c) => c.google_email)
    .filter((e): e is string => !!e);

  const { data: existingRows } = await supabaseAdmin
    .from("agenda_event_google_syncs")
    .select("user_id,google_event_id,calendar_id")
    .eq("event_id", eventId);
  const existingByUser = new Map<string, SyncRow>();
  for (const r of (existingRows ?? []) as SyncRow[]) existingByUser.set(r.user_id, r);

  if (connByUser.size === 0) {
    await supabaseAdmin
      .from("agenda_events")
      .update({ google_calendar_sync_status: "nao_sincronizado" })
      .eq("id", eventId);
    return { status: "nao_sincronizado" };
  }

  let anySuccess = false;
  const errors: string[] = [];

  for (const userId of recipientIds) {
    const conn = connByUser.get(userId);
    const existing = existingByUser.get(userId) ?? null;
    if (!conn) continue;

    const otherEmails = extraAttendeeEmails.filter(
      (e) => e.toLowerCase() !== (conn.google_email ?? "").toLowerCase(),
    );

    const result = await syncSingleRecipient(event, conn, existing, otherEmails);

    if (result.ok) {
      if (result.googleEventId) {
        await supabaseAdmin.from("agenda_event_google_syncs").upsert(
          {
            event_id: eventId,
            user_id: userId,
            google_event_id: result.googleEventId,
            calendar_id: conn.calendar_id || "primary",
            last_synced_at: new Date().toISOString(),
            last_error: null,
          },
          { onConflict: "event_id,user_id" },
        );
      } else if (existing) {
        await supabaseAdmin
          .from("agenda_event_google_syncs")
          .delete()
          .eq("event_id", eventId)
          .eq("user_id", userId);
      }
      anySuccess = true;
    } else {
      errors.push(`${userId.slice(0, 8)}: ${result.error}`);
      const tokenLooksInvalid = /invalid_grant|unauthorized|401/i.test(result.error);
      if (tokenLooksInvalid) {
        await supabaseAdmin
          .from("google_calendar_connections")
          .update({ last_error: "Token inválido. Reconecte sua conta Google." })
          .eq("user_id", userId);
        await notify(
          userId,
          "Reconecte sua conta Google",
          "A conexão com o Google Agenda expirou. Vá em Configurações para reconectar.",
        );
      }
    }
  }

  const finalStatus: "sincronizado" | "preparado" = anySuccess ? "sincronizado" : "preparado";
  await supabaseAdmin
    .from("agenda_events")
    .update({
      google_calendar_sync_status: finalStatus,
      google_synced_at: anySuccess ? new Date().toISOString() : null,
      google_calendar_sync_error: errors.length ? errors.join(" | ").slice(0, 500) : null,
    })
    .eq("id", eventId);

  return anySuccess
    ? { status: "sincronizado" }
    : { status: "preparado", error: errors.join(" | ") };
}

/**
 * Reprocessa todos os eventos futuros em que o usuário é owner/created_by/participante.
 * Chamado após conectar o Google, para popular a agenda pessoal.
 */
export async function backfillGoogleSyncForUser(userId: string): Promise<{ processed: number }> {
  const nowIso = new Date().toISOString();

  const [{ data: owned }, { data: parts }] = await Promise.all([
    supabaseAdmin
      .from("agenda_events")
      .select("id")
      .is("deleted_at", null)
      .gte("inicio", nowIso)
      .or(`owner_user_id.eq.${userId},created_by.eq.${userId}`),
    supabaseAdmin
      .from("agenda_event_participants")
      .select("event_id, agenda_events!inner(id,inicio,deleted_at)")
      .eq("user_id", userId)
      .is("agenda_events.deleted_at", null)
      .gte("agenda_events.inicio", nowIso),
  ]);

  const ids = new Set<string>();
  for (const r of (owned ?? []) as { id: string }[]) ids.add(r.id);
  for (const r of (parts ?? []) as { event_id: string }[]) ids.add(r.event_id);

  let processed = 0;
  for (const id of ids) {
    try {
      await syncAgendaEventToGoogle(id);
      processed += 1;
    } catch (e) {
      console.error("[backfillGoogleSyncForUser] evento", id, e);
    }
  }
  return { processed };
}
