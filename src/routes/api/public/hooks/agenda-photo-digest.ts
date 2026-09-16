import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Resumo diário da Agenda de fotos.
 *
 * Roda às 08:00 (America/Sao_Paulo) por pg_cron e cria UMA notificação por pessoa
 * listando as sessões de fotos/vídeo daquele dia civil em que ela é criadora,
 * responsável ou participante. O gatilho `notifications_enqueue_push` empurra a
 * mesma mensagem para o celular. Sem sessões no dia, nada é enviado.
 *
 * Idempotente por (usuário, dia) através do `dedup_key` único de `notifications`.
 * Não interfere nos lembretes por antecedência (1 dia / 1 hora / 30 min).
 */

const TIME_ZONE = "America/Sao_Paulo";
const PHOTO_TIPOS = ["fotos", "video"];

type Body = { day?: string; userId?: string };
type Agency = "cordial" | "morar" | "ambas";

type DigestEvent = {
  id: string;
  titulo: string | null;
  tipo: string | null;
  inicio: string;
  local: string | null;
  imovel_nome: string | null;
  imovel_descricao: string | null;
  imobiliaria: Agency;
  owner_user_id: string | null;
  created_by: string | null;
  agenda_event_participants: Array<{ user_id: string | null }>;
};

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

/** Dia civil (YYYY-MM-DD) em São Paulo para um instante qualquer. */
function localDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Deslocamento de São Paulo, em minutos, para o instante informado. */
function zoneOffsetMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour") % 24,
    value("minute"),
    value("second"),
  );
  return (asUtc - date.getTime()) / 60_000;
}

/** Início e fim (UTC) do dia civil de São Paulo. */
function dayBounds(dayKey: string): { start: Date; end: Date } {
  const naive = Date.parse(`${dayKey}T00:00:00Z`);
  const offset = zoneOffsetMinutes(new Date(naive));
  const start = new Date(naive - offset * 60_000);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDay(dayKey: string): string {
  const [year, month, day] = dayKey.split("-");
  return `${day}/${month}/${year}`;
}

function eventLine(event: DigestEvent): string {
  const place = event.imovel_nome || event.imovel_descricao || event.local;
  const titulo = (event.titulo ?? "").trim() || "Sessão de fotos";
  return `${formatTime(event.inicio)} · ${titulo}${place ? ` — ${place}` : ""}`;
}

export const Route = createFileRoute("/api/public/hooks/agenda-photo-digest")({
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

        let body: Body = {};
        try {
          const text = await request.text();
          if (text) {
            const parsed: unknown = JSON.parse(text);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              body = parsed as Body;
            }
          }
        } catch {
          body = {};
        }

        const dayKey = /^\d{4}-\d{2}-\d{2}$/.test(body.day ?? "")
          ? (body.day as string)
          : localDayKey(new Date());
        const { start, end } = dayBounds(dayKey);

        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: events, error } = await admin
          .from("agenda_events")
          .select(
            "id, titulo, tipo, inicio, local, imovel_nome, imovel_descricao, imobiliaria, owner_user_id, created_by, agenda_event_participants(user_id)",
          )
          .in("tipo", PHOTO_TIPOS)
          .is("deleted_at", null)
          .neq("status", "cancelado")
          .gte("inicio", start.toISOString())
          .lt("inicio", end.toISOString())
          .order("inicio", { ascending: true });
        if (error) {
          console.error("[agenda-photo-digest] events fetch failed", error);
          return Response.json({ error: error.message }, { status: 500 });
        }

        const rows = (events ?? []) as DigestEvent[];

        // Agrupa por pessoa envolvida (criador, responsável, participante).
        const byUser = new Map<string, DigestEvent[]>();
        for (const event of rows) {
          const people = new Set<string>();
          if (event.created_by) people.add(event.created_by);
          if (event.owner_user_id) people.add(event.owner_user_id);
          for (const participant of event.agenda_event_participants ?? []) {
            if (participant.user_id) people.add(participant.user_id);
          }
          for (const userId of people) {
            if (body.userId && userId !== body.userId) continue;
            const list = byUser.get(userId) ?? [];
            list.push(event);
            byUser.set(userId, list);
          }
        }

        if (byUser.size === 0) {
          return Response.json({ ok: true, day: dayKey, events: rows.length, sent: [], skipped: [] });
        }

        // Só recebe quem está vinculado a alguma imobiliária (mesma regra dos lembretes).
        const { data: memberships, error: membershipError } = await admin
          .from("user_agencies")
          .select("user_id, agency")
          .in("user_id", Array.from(byUser.keys()));
        if (membershipError) {
          console.error("[agenda-photo-digest] membership lookup failed", membershipError);
          return Response.json({ error: membershipError.message }, { status: 500 });
        }
        const agenciesByUser = new Map<string, Set<string>>();
        for (const row of (memberships ?? []) as Array<{ user_id: string; agency: string }>) {
          const set = agenciesByUser.get(row.user_id) ?? new Set<string>();
          set.add(row.agency);
          agenciesByUser.set(row.user_id, set);
        }

        const sent: Array<{ userId: string; events: number }> = [];
        const skipped: Array<{ userId: string; reason: string }> = [];

        for (const [userId, userEvents] of byUser) {
          const memberOf = agenciesByUser.get(userId);
          if (!memberOf || memberOf.size === 0) {
            skipped.push({ userId, reason: "agency_scope" });
            continue;
          }

          const visible = userEvents.filter(
            (event) => event.imobiliaria === "ambas" || memberOf.has(event.imobiliaria),
          );
          if (visible.length === 0) {
            skipped.push({ userId, reason: "agency_scope" });
            continue;
          }

          const agencies = new Set(visible.map((event) => event.imobiliaria));
          const agency: Agency = agencies.size === 1 ? [...agencies][0] : "ambas";

          const lines = visible
            .sort((a, b) => a.inicio.localeCompare(b.inicio))
            .map(eventLine);
          const titulo =
            visible.length === 1
              ? `Agenda de fotos — hoje (1 sessão)`
              : `Agenda de fotos — hoje (${visible.length} sessões)`;
          const mensagem = [`${formatDay(dayKey)}`, ...lines].join("\n");

          const { error: insertError } = await admin.from("notifications").insert({
            user_id: userId,
            tipo: "agenda_fotos",
            category: "agenda",
            titulo,
            mensagem,
            link: "/agenda/fotos",
            lida: false,
            imobiliaria: agency,
            dedup_key: `agenda_fotos_digest:${dayKey}:${userId}`,
            metadata: {
              day: dayKey,
              event_ids: visible.map((event) => event.id),
              digest: true,
            },
          });

          if (insertError) {
            const duplicate =
              insertError.code === "23505" || /duplicate key/i.test(insertError.message);
            skipped.push({ userId, reason: duplicate ? "already_sent" : insertError.message });
            if (!duplicate) console.error("[agenda-photo-digest] insert failed", insertError);
            continue;
          }
          sent.push({ userId, events: visible.length });
        }

        return Response.json({ ok: true, day: dayKey, events: rows.length, sent, skipped });
      },
      GET: async () =>
        Response.json({ ok: true, hint: "Agenda photo digest (08:00 America/Sao_Paulo)." }),
    },
  },
});
