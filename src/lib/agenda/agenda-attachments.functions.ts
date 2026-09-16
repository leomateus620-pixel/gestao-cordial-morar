import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AgendaAttachment } from "@/types/agenda";

const BUCKET = "agenda-attachments";

type Row = {
  id: string;
  event_id: string;
  kind: "foto" | "link";
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  url: string | null;
  label: string | null;
  created_by: string | null;
  created_at: string;
};

function mapRow(row: Row): AgendaAttachment {
  return {
    id: row.id,
    eventId: row.event_id,
    kind: row.kind,
    filePath: row.file_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    url: row.url,
    label: row.label,
    createdAt: row.created_at,
  };
}

/** Aceita apenas endereços http(s) — evita `javascript:` e afins no clique. */
function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) throw new Error("Informe o endereço do link.");
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("Link inválido. Confira o endereço.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Use um link começando com http:// ou https://");
  }
  return parsed.toString().slice(0, 2000);
}

export const listAgendaAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { eventId: string }) => data)
  .handler(async ({ data, context }): Promise<AgendaAttachment[]> => {
    const { data: rows, error } = await context.supabase
      .from("agenda_event_attachments")
      .select("*")
      .eq("event_id", data.eventId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Row[]).map(mapRow);
  });

/** Registra a foto já enviada ao Storage pelo navegador. */
export const registerAgendaPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      eventId: string;
      filePath: string;
      fileName: string;
      mimeType?: string | null;
      sizeBytes?: number | null;
      label?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }): Promise<AgendaAttachment> => {
    if (!data.filePath.startsWith(`${data.eventId}/`)) {
      throw new Error("Arquivo fora da pasta do compromisso.");
    }
    const { data: row, error } = await context.supabase
      .from("agenda_event_attachments")
      .insert({
        event_id: data.eventId,
        kind: "foto",
        file_path: data.filePath,
        file_name: data.fileName.slice(0, 200),
        mime_type: data.mimeType ?? null,
        size_bytes: data.sizeBytes ?? null,
        label: data.label?.trim() ? data.label.trim().slice(0, 160) : null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapRow(row as Row);
  });

export const addAgendaLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { eventId: string; url: string; label?: string | null }) => data)
  .handler(async ({ data, context }): Promise<AgendaAttachment> => {
    const url = normalizeUrl(data.url);
    const { data: row, error } = await context.supabase
      .from("agenda_event_attachments")
      .insert({
        event_id: data.eventId,
        kind: "link",
        url,
        label: data.label?.trim() ? data.label.trim().slice(0, 160) : null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapRow(row as Row);
  });

export const deleteAgendaAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: existing } = await context.supabase
      .from("agenda_event_attachments")
      .select("file_path")
      .eq("id", data.id)
      .maybeSingle();
    const filePath = (existing as { file_path?: string | null } | null)?.file_path;
    if (filePath) await context.supabase.storage.from(BUCKET).remove([filePath]);
    const { error } = await context.supabase
      .from("agenda_event_attachments")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Links temporários das fotos para exibir miniaturas no detalhe. */
export const signAgendaAttachmentUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { paths: string[] }) => data)
  .handler(async ({ data, context }): Promise<Record<string, string>> => {
    const paths = (data.paths ?? []).filter((path) => typeof path === "string" && path).slice(0, 60);
    if (paths.length === 0) return {};
    const result: Record<string, string> = {};
    await Promise.all(
      paths.map(async (path) => {
        const { data: signed } = await context.supabase.storage
          .from(BUCKET)
          .createSignedUrl(path, 3600);
        if (signed?.signedUrl) result[path] = signed.signedUrl;
      }),
    );
    return result;
  });
