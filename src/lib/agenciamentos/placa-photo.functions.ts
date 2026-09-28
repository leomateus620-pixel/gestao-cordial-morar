import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rowToAgenciamento, type AgenciamentoDbRow } from "@/lib/agenciamentos/agenciamentos.server";
import type { Agenciamento } from "@/types/agenciamento";

/** Bucket privado da prova fotográfica da placa (não é galeria do imóvel). */
export const PLACA_PHOTO_BUCKET = "agenciamento-placa-photos";

/**
 * Registra a foto já enviada pelo navegador e marca a placa como instalada.
 * A foto anterior (se houver) sai do Storage — só existe uma por agenciamento.
 */
export const registerPlacaPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { agenciamentoId: string; filePath: string; mimeType?: string | null }) => {
    if (!data?.agenciamentoId || !data.filePath) throw new Error("Foto da placa não informada.");
    if (!data.filePath.startsWith(`${data.agenciamentoId}/`)) {
      throw new Error("Arquivo fora da pasta do agenciamento.");
    }
    if (data.mimeType && !data.mimeType.startsWith("image/")) {
      throw new Error("Envie apenas uma imagem.");
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<Agenciamento> => {
    const { data: current, error: readError } = await context.supabase
      .from("agenciamentos")
      .select("placa_foto_path")
      .eq("id", data.agenciamentoId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!current) throw new Error("Agenciamento não encontrado ou sem permissão.");
    const previous = (current as { placa_foto_path?: string | null }).placa_foto_path ?? null;

    const { data: updated, error } = await context.supabase
      .from("agenciamentos")
      .update({
        placa_foto_path: data.filePath,
        placa_foto_mime: data.mimeType ?? null,
        placa_foto_uploaded_at: new Date().toISOString(),
        placa_instalada: true,
      } as never)
      .eq("id", data.agenciamentoId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (previous && previous !== data.filePath) {
      await context.supabase.storage.from(PLACA_PHOTO_BUCKET).remove([previous]);
    }
    return rowToAgenciamento(updated as unknown as AgenciamentoDbRow);
  });

/** Remove a foto: sem foto a placa volta a ficar pendente. */
export const removePlacaPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { agenciamentoId: string }) => data)
  .handler(async ({ data, context }): Promise<Agenciamento> => {
    const { data: current } = await context.supabase
      .from("agenciamentos")
      .select("placa_foto_path")
      .eq("id", data.agenciamentoId)
      .maybeSingle();
    const previous = (current as { placa_foto_path?: string | null } | null)?.placa_foto_path ?? null;
    const { data: updated, error } = await context.supabase
      .from("agenciamentos")
      .update({
        placa_foto_path: null,
        placa_foto_mime: null,
        placa_foto_uploaded_at: null,
        placa_instalada: false,
      } as never)
      .eq("id", data.agenciamentoId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    if (previous) await context.supabase.storage.from(PLACA_PHOTO_BUCKET).remove([previous]);
    return rowToAgenciamento(updated as unknown as AgenciamentoDbRow);
  });

/** Links temporários (1 h) para miniaturas e impressão. */
export const signPlacaPhotoUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { paths: string[] }) => data)
  .handler(async ({ data, context }): Promise<Record<string, string>> => {
    const paths = Array.from(new Set((data.paths ?? []).filter((p) => typeof p === "string" && p))).slice(0, 500);
    if (paths.length === 0) return {};
    const { data: signed, error } = await context.supabase.storage
      .from(PLACA_PHOTO_BUCKET)
      .createSignedUrls(paths, 3600);
    if (error) throw new Error(error.message);
    const result: Record<string, string> = {};
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) result[item.path] = item.signedUrl;
    }
    return result;
  });
