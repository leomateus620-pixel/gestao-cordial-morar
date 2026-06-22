import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const startGoogleOAuth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { signState, buildAuthUrl } = await import("./google.server");
    const req = getRequest();
    const origin = new URL(req.url).origin;
    const state = signState({ userId: context.userId, origin });
    return { url: buildAuthUrl(state, origin) };
  });

export const getMyGoogleConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("google_calendar_connections")
      .select("google_email,calendar_id,scope,last_error,created_at,updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data;
  });

export const disconnectGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { revokeToken } = await import("./google.server");
    const { data: conn } = await supabaseAdmin
      .from("google_calendar_connections")
      .select("refresh_token,access_token")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (conn) {
      await revokeToken(conn.refresh_token || conn.access_token);
      await supabaseAdmin
        .from("google_calendar_connections")
        .delete()
        .eq("user_id", context.userId);
    }
    return { ok: true };
  });

export const resyncAgendaEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { eventId: string }) => d)
  .handler(async ({ data, context }) => {
    // RLS check: usuário precisa ter acesso
    const { data: allowed } = await context.supabase.rpc("agenda_can_access", {
      _event_id: data.eventId,
    });
    if (!allowed) throw new Error("Sem permissão");
    const { syncAgendaEventToGoogle } = await import("./google.server");
    return syncAgendaEventToGoogle(data.eventId);
  });
