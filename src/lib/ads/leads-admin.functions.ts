import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const recoverMetaFormLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: { mappingId: string; since: string; until: string }) =>
    z
      .object({
        mappingId: z.string().uuid(),
        since: z.iso.datetime({ offset: true }),
        until: z.iso.datetime({ offset: true }),
      })
      .refine(
        (v) =>
          Date.parse(v.until) >= Date.parse(v.since) &&
          Date.parse(v.until) - Date.parse(v.since) <= 30 * 86400000,
        "Recupere no máximo 30 dias por solicitação.",
      )
      .parse(value),
  )
  .handler(async ({ context, data }) => {
    const { requireMarketingAction } = await import("./authorization.server");
    await requireMarketingAction(context, "manage_connection");
    const { data: id, error } = await context.supabase.rpc(
      "meta_lead_recovery_request" as never,
      { p_mapping_id: data.mappingId, p_since: data.since, p_until: data.until } as never,
    );
    if (error)
      throw new Error(
        "Não foi possível agendar. Confira o mapeamento e selecione até 30 dias passados.",
      );
    return { id: String(id), status: "queued" as const, processed: 0, hasMore: true };
  });
export const getMetaLeadHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: { imobiliaria: "cordial" | "morar" }) =>
    z.object({ imobiliaria: z.enum(["cordial", "morar"]) }).parse(value),
  )
  .handler(async ({ context, data }) => {
    const { requireMarketingAction } = await import("./authorization.server");
    await requireMarketingAction(context, "read_lead_contacts", data.imobiliaria);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as SupabaseClient;
    const results = await Promise.all([
      db
        .from("meta_lead_form_mappings")
        .select("id", { count: "exact", head: true })
        .eq("imobiliaria", data.imobiliaria)
        .eq("enabled", true),
      db
        .from("meta_lead_submissions")
        .select("received_at,completed_at", { count: "exact" })
        .eq("imobiliaria", data.imobiliaria)
        .eq("is_synthetic", false)
        .is("privacy_deleted_at", null)
        .order("received_at", { ascending: false })
        .limit(1),
      db
        .from("meta_lead_submissions")
        .select("id", { count: "exact", head: true })
        .eq("imobiliaria", data.imobiliaria)
        .is("privacy_deleted_at", null)
        .in("status", ["queued", "processing"]),
      db
        .from("meta_lead_submissions")
        .select("id", { count: "exact", head: true })
        .eq("imobiliaria", data.imobiliaria)
        .is("privacy_deleted_at", null)
        .in("status", ["failed", "review", "quarantined"]),
      db
        .from("meta_lead_submissions")
        .select("completed_at")
        .eq("imobiliaria", data.imobiliaria)
        .eq("is_synthetic", false)
        .is("privacy_deleted_at", null)
        .not("attendance_id", "is", null)
        .order("completed_at", { ascending: false })
        .limit(1),
      db
        .from("meta_lead_submissions")
        .select("completed_at")
        .eq("imobiliaria", data.imobiliaria)
        .eq("is_synthetic", true)
        .is("privacy_deleted_at", null)
        .not("attendance_id", "is", null)
        .order("completed_at", { ascending: false })
        .limit(1),
    ]);
    if (results.some((r) => r.error)) throw new Error("Diagnóstico de leads indisponível.");
    return {
      mappedForms: results[0].count ?? 0,
      submissions: results[1].count ?? 0,
      lastEvent: results[1].data?.[0]?.received_at ?? null,
      queued: results[2].count ?? 0,
      needsReview: results[3].count ?? 0,
      lastAttendance: results[4].data?.[0]?.completed_at ?? null,
      lastSyntheticAttendance: results[5].data?.[0]?.completed_at ?? null,
      // A CRM import (including recovery) alone does not prove the webhook callback round trip.
      endToEnd: "unverified" as const,
      recoveryWindow:
        "Até 30 dias por solicitação, limitado à disponibilidade efetiva da Meta; sem garantia de histórico completo.",
    };
  });

export const listMetaLeadRecoveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: { imobiliaria: "cordial" | "morar" }) =>
    z.object({ imobiliaria: z.enum(["cordial", "morar"]) }).parse(value),
  )
  .handler(async ({ context, data }) => {
    const { requireMarketingAction } = await import("./authorization.server");
    await requireMarketingAction(context, "manage_connection", data.imobiliaria);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as SupabaseClient)
      .from("meta_lead_recovery_jobs")
      .select(
        "id,mapping_id,range_start,range_end,status,processed,pages,error_code,updated_at,meta_lead_form_mappings!inner(imobiliaria,form_id)",
      )
      .eq("meta_lead_form_mappings.imobiliaria", data.imobiliaria)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("Histórico de recuperação indisponível.");
    return rows ?? [];
  });
