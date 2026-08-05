import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { InternalDocument } from "@/types/internal-document";

const BUCKET = "internal-documents";

type Row = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: Row): InternalDocument {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    filePath: row.file_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type AuthedContext = {
  supabase: {
    from: (t: string) => any;
    storage: { from: (b: string) => any };
  };
  userId: string;
};

async function assertAdmin(context: AuthedContext) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = ((data ?? []) as Array<{ role: string }>).map((r) => r.role);
  if (!roles.includes("admin")) {
    throw new Error("Somente administradores podem acessar os documentos internos.");
  }
}

export const listInternalDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InternalDocument[]> => {
    await assertAdmin(context as unknown as AuthedContext);
    const { data, error } = await context.supabase
      .from("internal_documents")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Row[]).map(mapRow);
  });

export const registerInternalDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      title: string;
      description?: string | null;
      category?: string;
      filePath: string;
      fileName: string;
      mimeType?: string | null;
      sizeBytes?: number | null;
    }) => data,
  )
  .handler(async ({ data, context }): Promise<InternalDocument> => {
    await assertAdmin(context as unknown as AuthedContext);
    const title = data.title.trim().slice(0, 180) || data.fileName;

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("nome")
      .eq("id", context.userId)
      .maybeSingle();

    const { data: row, error } = await context.supabase
      .from("internal_documents")
      .insert({
        title,
        description: data.description?.trim() ? data.description.trim().slice(0, 600) : null,
        category: data.category?.trim() || "geral",
        file_path: data.filePath,
        file_name: data.fileName,
        mime_type: data.mimeType ?? null,
        size_bytes: data.sizeBytes ?? null,
        uploaded_by: context.userId,
        uploaded_by_name: (profile as { nome?: string } | null)?.nome ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapRow(row as Row);
  });

export const updateInternalDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; title: string; description?: string | null }) => data)
  .handler(async ({ data, context }): Promise<InternalDocument> => {
    await assertAdmin(context as unknown as AuthedContext);
    const title = data.title.trim().slice(0, 180);
    if (!title) throw new Error("Informe um nome para o documento.");
    const { data: row, error } = await context.supabase
      .from("internal_documents")
      .update({
        title,
        description: data.description?.trim() ? data.description.trim().slice(0, 600) : null,
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapRow(row as Row);
  });

export const deleteInternalDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context as unknown as AuthedContext);
    const { data: existing } = await context.supabase
      .from("internal_documents")
      .select("file_path")
      .eq("id", data.id)
      .maybeSingle();
    const filePath = (existing as { file_path?: string } | null)?.file_path;
    if (filePath) {
      await context.supabase.storage.from(BUCKET).remove([filePath]);
    }
    const { error } = await context.supabase
      .from("internal_documents")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getInternalDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { path: string; download?: boolean; fileName?: string }) => data)
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    await assertAdmin(context as unknown as AuthedContext);
    const { data: signed, error } = await context.supabase.storage
      .from(BUCKET)
      .createSignedUrl(data.path, 3600, data.download ? { download: data.fileName ?? true } : {});
    if (error || !signed?.signedUrl) {
      throw new Error(error?.message ?? "Não foi possível gerar o link do documento.");
    }
    return { url: signed.signedUrl };
  });
