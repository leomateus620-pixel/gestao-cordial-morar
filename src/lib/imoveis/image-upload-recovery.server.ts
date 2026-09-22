import type { SupabaseClient } from "@supabase/supabase-js";

type Reservation = {
  id: string;
  property_id: string;
  storage_path: string;
  created_at: string;
  attempts: number;
  status: "reserved" | "missing";
};

const BUCKET = "property-images";
const MISSING_AFTER_MS = 24 * 60 * 60 * 1000;

/** O upload assinado pode terminar com a aba fechada antes da RPC de registro. */
export async function recoverPersistedOriginalUploads(
  admin: SupabaseClient, limit = 20,
): Promise<{ registered: number; missing: number; deferred: number }> {
  const { data, error } = await admin
    .from("property_image_upload_reservations")
    .select("id, property_id, storage_path, created_at, attempts, status")
    .in("status", ["reserved", "missing"])
    .lte("next_check_at", new Date().toISOString())
    .order("next_check_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (error) throw new Error(error.message);
  let registered = 0;
  let missing = 0;
  let deferred = 0;
  for (const reservation of (data ?? []) as Reservation[]) {
    const slash = reservation.storage_path.lastIndexOf("/");
    const directory = reservation.storage_path.slice(0, slash);
    const name = reservation.storage_path.slice(slash + 1);
    try {
      const { data: objects, error: storageError } = await admin.storage
        .from(BUCKET).list(directory, { search: name, limit: 100 });
      if (storageError) throw new Error(storageError.message);
      const arrived = (objects ?? []).some(
        (object) => object.name === name && Number(object.metadata?.size ?? 0) > 0,
      );
      if (arrived) {
        const { data: result, error: finalizeError } = await admin.rpc(
          "property_image_upload_finalize" as never,
          { _reservation_id: reservation.id } as never,
        );
        if (finalizeError) throw new Error(finalizeError.message);
        if ((result as { status?: string } | null)?.status === "registered") registered++;
        continue;
      }
      if (reservation.status === "missing") {
        const { error: laterError } = await admin
          .from("property_image_upload_reservations")
          .update({ next_check_at: new Date(Date.now() + 24 * 3_600_000).toISOString() })
          .eq("id", reservation.id).eq("status", "missing");
        if (laterError) throw new Error(laterError.message);
        deferred++;
        continue;
      }
      // A primeira leitura depois de uma longa indisponibilidade do worker
      // não basta para declarar que os bytes nunca chegaram.
      const expired = reservation.attempts >= 2 &&
        Date.now() - Date.parse(reservation.created_at) >= MISSING_AFTER_MS;
      if (expired) {
        const { data: marked, error: markError } = await admin.rpc(
          "property_image_upload_mark_missing" as never,
          { _reservation_id: reservation.id } as never,
        );
        if (markError) throw new Error(markError.message);
        if (marked === true) missing++;
        continue;
      }
      const { error: updateError } = await admin
        .from("property_image_upload_reservations")
        .update({ attempts: reservation.attempts + 1,
          next_check_at: new Date(Date.now() + 5 * 60_000).toISOString() })
        .eq("id", reservation.id).eq("status", "reserved");
      if (updateError) throw new Error(updateError.message);
      deferred++;
    } catch (error) {
      // Um erro temporário do Storage não prova que o arquivo está ausente.
      const { error: deferError } = await admin
        .from("property_image_upload_reservations")
        .update({ attempts: reservation.attempts + 1,
          next_check_at: new Date(Date.now() + 5 * 60_000).toISOString() })
        .eq("id", reservation.id).in("status", ["reserved", "missing"]);
      if (deferError) throw new Error(deferError.message);
      console.error("[image_upload_recovery_deferred]", JSON.stringify({
        propertyId: reservation.property_id, reservationId: reservation.id,
        error: error instanceof Error ? error.message : String(error),
      }));
      deferred++;
    }
  }
  return { registered, missing, deferred };
}

/** Descarta apenas cópias confirmadas como duplicadas e não referenciadas. */
export async function cleanupDuplicateOriginalUploads(
  admin: SupabaseClient, limit = 5,
): Promise<number> {
  const { data, error } = await admin
    .from("property_image_upload_reservations")
    .select("id, storage_path")
    .eq("status", "duplicated")
    .is("storage_cleaned_at", null)
    .lte("next_check_at", new Date().toISOString())
    .order("next_check_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 20));
  if (error) throw new Error(error.message);
  let cleaned = 0;
  for (const row of (data ?? []) as Array<{ id: string; storage_path: string }>) {
    const [primary, original] = await Promise.all([
      admin.from("property_images").select("id", { count: "exact", head: true })
        .eq("storage_path", row.storage_path),
      admin.from("property_images").select("id", { count: "exact", head: true })
        .eq("original_storage_path", row.storage_path),
    ]);
    if (primary.error || original.error) {
      throw new Error(primary.error?.message ?? original.error?.message);
    }
    if ((primary.count ?? 0) > 0 || (original.count ?? 0) > 0) {
      // Referência inesperada: não eliminar bytes; manter a reserva para
      // diagnóstico e nova checagem, sem bloquear os próximos candidatos.
      const { error: deferError } = await admin
        .from("property_image_upload_reservations")
        .update({ next_check_at: new Date(Date.now() + 24 * 3_600_000).toISOString() })
        .eq("id", row.id).eq("status", "duplicated");
      if (deferError) throw new Error(deferError.message);
      continue;
    }
    const removed = await admin.storage.from(BUCKET).remove([row.storage_path]);
    if (removed.error) {
      const { error: deferError } = await admin
        .from("property_image_upload_reservations")
        .update({ next_check_at: new Date(Date.now() + 5 * 60_000).toISOString() })
        .eq("id", row.id).eq("status", "duplicated");
      if (deferError) throw new Error(deferError.message);
      continue;
    }
    const { error: updateError } = await admin
      .from("property_image_upload_reservations")
      .update({ storage_cleaned_at: new Date().toISOString() })
      .eq("id", row.id).eq("status", "duplicated");
    if (updateError) throw new Error(updateError.message);
    cleaned++;
  }
  return cleaned;
}
