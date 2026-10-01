import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "property-images";

type AnyClient = SupabaseClient<any, any, any>;

/**
 * Apaga os arquivos das fotos no Storage e remove a linha de `properties`.
 * As tabelas filhas (fotos, vídeos, publicações, Drive, jobs) têm FK
 * `ON DELETE CASCADE`, então saem junto com o imóvel.
 */
export async function purgeProperty(admin: AnyClient, propertyId: string): Promise<void> {
  const { data: images } = await admin
    .from("property_images")
    .select("storage_path, original_storage_path, processed_storage_path, thumbnail_storage_path")
    .eq("property_id", propertyId);

  const paths = Array.from(
    new Set(
      ((images ?? []) as Array<Record<string, string | null>>)
        .flatMap((row) => [
          row["storage_path"],
          row["original_storage_path"],
          row["processed_storage_path"],
          row["thumbnail_storage_path"],
        ])
        .filter((path): path is string => Boolean(path)),
    ),
  );

  if (paths.length) {
    // Falha no Storage não pode travar a exclusão do cadastro.
    try {
      await admin.storage.from(BUCKET).remove(paths);
    } catch {
      /* ignora */
    }
  }

  // Imóvel apagado devolve os códigos Cordial/Morar para a numeração.
  try {
    await admin
      .from("provider_code_reservations")
      .update({ status: "released", property_id: null })
      .eq("property_id", propertyId);
  } catch {
    /* ignora */
  }

  const { error } = await admin.from("properties").delete().eq("id", propertyId);
  if (error) throw new Error(error.message);
}

/**
 * Conclui a exclusão de um imóvel marcado como `pending_removal` assim que
 * todos os provedores confirmaram a remoção do anúncio.
 */
export async function finalizePendingRemoval(
  admin: AnyClient,
  propertyId: string,
): Promise<boolean> {
  const { data: property } = await admin
    .from("properties")
    .select("id, removal_state")
    .eq("id", propertyId)
    .maybeSingle();
  if (!property || (property as { removal_state?: string | null }).removal_state !== "pending_removal") {
    return false;
  }

  const { data: links } = await admin
    .from("property_provider_publications")
    .select("enabled, external_property_id")
    .eq("property_id", propertyId);

  const stillLive = ((links ?? []) as Array<{ enabled: boolean; external_property_id: string | null }>).some(
    (link) => link.enabled || link.external_property_id,
  );
  if (stillLive) return false;

  await purgeProperty(admin, propertyId);
  return true;
}

export type FinalizeArchiveResult =
  | { status: "archived" | "not_found" | "not_pending" | "stale" }
  | { status: "pending"; providers: string[] };

/**
 * Conclui o arquivamento de um imóvel em `pending_archive`. A decisão é do
 * banco (`property_archive_finalize`), numa transação: só arquiva quando TODO
 * destino marcado na intenção vigente confirmou a retirada. `enabled = false`
 * não conta como confirmação. Erro de leitura é repassado, nunca vira "vazio".
 */
export async function finalizePendingArchive(
  admin: AnyClient,
  propertyId: string,
  expectedRevision: number | null = null,
): Promise<FinalizeArchiveResult> {
  const { data, error } = await admin.rpc("property_archive_finalize", {
    _property_id: propertyId,
    _expected_revision: expectedRevision,
  });
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as { status?: string; providers?: string[] };
  if (result.status === "pending") return { status: "pending", providers: result.providers ?? [] };
  if (!result.status) throw new Error("Resposta inválida ao concluir o arquivamento.");
  return { status: result.status as "archived" };
}

/** Recuperação: tenta concluir arquivamentos pendentes (ex.: queda após ocultar no site). */
export async function finalizeStalledArchives(admin: AnyClient, limit = 50): Promise<number> {
  const { data, error } = await admin
    .from("properties")
    .select("id")
    .eq("removal_state", "pending_archive")
    .limit(limit);
  if (error) throw new Error(error.message);
  let archived = 0;
  for (const row of (data ?? []) as Array<{ id: string }>) {
    const result = await finalizePendingArchive(admin, row.id);
    if (result.status === "archived") archived += 1;
  }
  return archived;
}
