import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PropertyCodeReservation = {
  provider: "cordial" | "morar";
  code: string;
  reservationId: string;
  expiresAt: string;
  /** true = confirmado livre no site; false = ocupado; null = não foi possível validar agora. */
  verified: boolean | null;
};

/** Reserva atômica do próximo código livre da imobiliária escolhida. */
export const reservePropertyCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { provider: "cordial" | "morar"; propertyId?: string | null }) => data)
  .handler(async ({ data, context }): Promise<PropertyCodeReservation> => {
    const { remoteCodeTaken } = await import("./codes.server");
    const attempts: string[] = [];

    for (let i = 0; i < 5; i += 1) {
      const { data: rows, error } = await context.supabase.rpc("reserve_provider_code", {
        _provider: data.provider,
        _property_id: data.propertyId ?? undefined,
        _ttl_minutes: 30,
      });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(rows) ? rows[0] : rows) as
        | { code: string; reservation_id: string; expires_at: string }
        | undefined;
      if (!row) throw new Error("Não foi possível gerar um código agora.");

      const taken = await remoteCodeTaken(data.provider, row.code);
      if (taken === true) {
        // Código já usado no site: marca como consumido e tenta o próximo.
        attempts.push(row.code);
        await context.supabase
          .from("provider_code_reservations")
          .update({ status: "taken_remote" })
          .eq("id", row.reservation_id);
        continue;
      }

      return {
        provider: data.provider,
        code: row.code,
        reservationId: row.reservation_id,
        expiresAt: row.expires_at,
        verified: taken === false ? true : null,
      };
    }

    throw new Error(
      `Os códigos ${attempts.join(", ")} já estão em uso no site. Tente novamente em instantes.`,
    );
  });

/** Libera uma reserva não utilizada (troca de destino, cancelamento do cadastro). */
export const releasePropertyCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { reservationId: string }) => data)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("provider_code_reservations")
      .update({ status: "released" })
      .eq("id", data.reservationId)
      .eq("status", "reserved");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Devolve à fila todas as reservas do próprio usuário que ainda não viraram
 * imóvel salvo (cadastro abandonado, cancelado ou aba fechada).
 */
export const releasePendingPropertyCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data?: { reservationIds?: string[] }) => data ?? {})
  .handler(async ({ data, context }): Promise<{ released: number }> => {
    let query = context.supabase
      .from("provider_code_reservations")
      .update({ status: "released" })
      .eq("reserved_by", context.userId)
      .eq("status", "reserved")
      .is("property_id", null);
    if (data.reservationIds?.length) query = query.in("id", data.reservationIds);
    const { data: rows, error } = await query.select("id");
    if (error) throw new Error(error.message);
    return { released: rows?.length ?? 0 };
  });

/** Confirma as reservas assim que o imóvel é salvo. */
export const commitPropertyCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; reservationIds: string[] }) => data)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    if (!data.reservationIds.length) return { ok: true };
    const { error } = await context.supabase
      .from("provider_code_reservations")
      .update({
        status: "committed",
        property_id: data.propertyId,
        committed_at: new Date().toISOString(),
      })
      .in("id", data.reservationIds);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
