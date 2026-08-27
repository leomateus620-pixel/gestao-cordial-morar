import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PropertyImage } from "@/types/property";

const BUCKET = "property-images";

type ImageRow = {
  id: string;
  storage_path: string;
  is_cover: boolean;
  position: number;
  file_name: string;
  content_hash: string | null;
  upload_status: string;
};

async function signImages(
  supabase: {
    storage: {
      from: (b: string) => {
        createSignedUrls: (
          paths: string[],
          expires: number,
        ) => Promise<{ data: Array<{ path?: string | null; signedUrl: string }> | null }>;
      };
    };
  },
  rows: ImageRow[],
): Promise<PropertyImage[]> {
  if (!rows.length) return [];
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(rows.map((r) => r.storage_path), 3600);
  const byPath = new Map((signed ?? []).map((s) => [s.path ?? "", s.signedUrl]));
  return rows.map((r) => ({
    id: r.id,
    url: byPath.get(r.storage_path) ?? "",
    isCover: r.is_cover,
    position: r.position,
  }));
}

async function listRows(supabase: { from: (t: string) => any }, propertyId: string): Promise<ImageRow[]> {
  const { data, error } = await supabase
    .from("property_images")
    .select("id, storage_path, is_cover, position, file_name, content_hash, upload_status")
    .eq("property_id", propertyId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ImageRow[];
}

export const listPropertyImages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string }) => data)
  .handler(async ({ data, context }): Promise<PropertyImage[]> =>
    signImages(context.supabase as never, await listRows(context.supabase as never, data.propertyId)),
  );

/** URL assinada de upload — o arquivo vai direto do navegador para o bucket privado. */
export const createPropertyImageUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; fileName: string }) => data)
  .handler(async ({ data, context }): Promise<{ path: string; token: string }> => {
    const safe = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const path = `${data.propertyId}/${crypto.randomUUID()}-${safe}`;
    const { data: signed, error } = await context.supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "Falha ao preparar o envio da foto.");
    return { path: signed.path, token: signed.token };
  });

/** Registra a foto já enviada, evitando duplicatas pelo checksum. */
export const registerPropertyImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      propertyId: string;
      storagePath: string;
      fileName: string;
      mimeType?: string | null;
      sizeBytes?: number | null;
      contentHash: string;
    }) => data,
  )
  .handler(async ({ data, context }): Promise<{ images: PropertyImage[]; duplicated: boolean }> => {
    const rows = await listRows(context.supabase as never, data.propertyId);
    const duplicate = rows.find((r) => r.content_hash && r.content_hash === data.contentHash);
    if (duplicate) {
      await context.supabase.storage.from(BUCKET).remove([data.storagePath]);
      return { images: await signImages(context.supabase as never, rows), duplicated: true };
    }

    const position = rows.length ? Math.max(...rows.map((r) => r.position)) + 1 : 0;
    const { error } = await context.supabase.from("property_images").insert({
      property_id: data.propertyId,
      storage_path: data.storagePath,
      file_name: data.fileName,
      mime_type: data.mimeType ?? null,
      size_bytes: data.sizeBytes ?? null,
      content_hash: data.contentHash,
      position,
      is_cover: rows.length === 0,
      upload_status: "ready",
      uploaded_by: context.userId,
    });
    if (error) throw new Error(error.message);

    return {
      images: await signImages(context.supabase as never, await listRows(context.supabase as never, data.propertyId)),
      duplicated: false,
    };
  });

export const setPropertyImageCover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; imageId: string }) => data)
  .handler(async ({ data, context }): Promise<PropertyImage[]> => {
    // O índice único garante uma capa por imóvel: zera antes de marcar a nova.
    await context.supabase
      .from("property_images")
      .update({ is_cover: false })
      .eq("property_id", data.propertyId)
      .eq("is_cover", true);
    const { error } = await context.supabase
      .from("property_images")
      .update({ is_cover: true })
      .eq("id", data.imageId)
      .eq("property_id", data.propertyId);
    if (error) throw new Error(error.message);
    return signImages(context.supabase as never, await listRows(context.supabase as never, data.propertyId));
  });

export const reorderPropertyImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; orderedIds: string[] }) => data)
  .handler(async ({ data, context }): Promise<PropertyImage[]> => {
    for (let i = 0; i < data.orderedIds.length; i += 1) {
      const id = data.orderedIds[i]!;
      const { error } = await context.supabase
        .from("property_images")
        .update({ position: i })
        .eq("id", id)
        .eq("property_id", data.propertyId);
      if (error) throw new Error(error.message);
    }
    return signImages(context.supabase as never, await listRows(context.supabase as never, data.propertyId));
  });

/**
 * Remove a foto: o arquivo só sai do Storage depois que o registro é apagado,
 * e a capa é reatribuída para a primeira foto restante.
 */
export const deletePropertyImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; imageId: string }) => data)
  .handler(async ({ data, context }): Promise<PropertyImage[]> => {
    const rows = await listRows(context.supabase as never, data.propertyId);
    const target = rows.find((r) => r.id === data.imageId);
    if (!target) return signImages(context.supabase as never, rows);

    const { error } = await context.supabase
      .from("property_images")
      .delete()
      .eq("id", data.imageId)
      .eq("property_id", data.propertyId);
    if (error) throw new Error(error.message);
    await context.supabase.storage.from(BUCKET).remove([target.storage_path]);

    const remaining = await listRows(context.supabase as never, data.propertyId);
    if (target.is_cover && remaining.length) {
      await context.supabase
        .from("property_images")
        .update({ is_cover: true })
        .eq("id", remaining[0]!.id);
    }
    return signImages(context.supabase as never, await listRows(context.supabase as never, data.propertyId));
  });
