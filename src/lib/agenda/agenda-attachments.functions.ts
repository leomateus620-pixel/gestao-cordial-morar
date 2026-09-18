import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AgendaAttachment, AgendaAttachmentPurpose } from "@/types/agenda";

const BUCKET = "agenda-attachments";

type Row = {
  id: string;
  event_id: string;
  kind: "foto" | "link";
  purpose: AgendaAttachmentPurpose | null;
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
    purpose: (row.purpose ?? "general") as AgendaAttachmentPurpose,
    filePath: row.file_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    url: row.url,
    label: row.label,
    createdAt: row.created_at,
  };
}

const asPurpose = (value?: string | null): AgendaAttachmentPurpose =>
  value === "property_reference" ? "property_reference" : "general";

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

/**
 * Substituição idempotente da referência do imóvel: só existe uma foto e um link
 * `property_reference` por compromisso, então o anterior sai antes do novo entrar
 * (inclusive o arquivo no Storage). Retentativas não duplicam anexo.
 */
async function clearReference(
  supabase: {
    from: (table: string) => any;
    storage: { from: (bucket: string) => { remove: (paths: string[]) => Promise<unknown> } };
  },
  eventId: string,
  kind: "foto" | "link",
) {
  const { data: rows } = await supabase
    .from("agenda_event_attachments")
    .select("id,file_path")
    .eq("event_id", eventId)
    .eq("purpose", "property_reference")
    .eq("kind", kind);
  const existing = (rows ?? []) as Array<{ id: string; file_path: string | null }>;
  if (existing.length === 0) return;
  const paths = existing.map((row) => row.file_path).filter(Boolean) as string[];
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  await supabase
    .from("agenda_event_attachments")
    .delete()
    .in(
      "id",
      existing.map((row) => row.id),
    );
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
      purpose?: AgendaAttachmentPurpose;
    }) => data,
  )
  .handler(async ({ data, context }): Promise<AgendaAttachment> => {
    if (!data.filePath.startsWith(`${data.eventId}/`)) {
      throw new Error("Arquivo fora da pasta do compromisso.");
    }
    if (data.mimeType && !data.mimeType.startsWith("image/")) {
      throw new Error("Envie apenas arquivos de imagem.");
    }
    if (data.sizeBytes && data.sizeBytes > 25 * 1024 * 1024) {
      throw new Error("A imagem passa de 25 MB.");
    }
    const purpose = asPurpose(data.purpose);
    if (purpose === "property_reference") {
      await clearReference(context.supabase as never, data.eventId, "foto");
    }
    const { data: row, error } = await context.supabase
      .from("agenda_event_attachments")
      .insert({
        event_id: data.eventId,
        kind: "foto",
        purpose,
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
  .inputValidator(
    (data: {
      eventId: string;
      url: string;
      label?: string | null;
      purpose?: AgendaAttachmentPurpose;
    }) => data,
  )
  .handler(async ({ data, context }): Promise<AgendaAttachment> => {
    const url = normalizeUrl(data.url);
    const purpose = asPurpose(data.purpose);
    if (purpose === "property_reference") {
      await clearReference(context.supabase as never, data.eventId, "link");
    }
    const { data: row, error } = await context.supabase
      .from("agenda_event_attachments")
      .insert({
        event_id: data.eventId,
        kind: "link",
        purpose,
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

/** Remove a foto ou o link de referência do imóvel de um compromisso. */
export const clearAgendaReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { eventId: string; kind: "foto" | "link" }) => data)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await clearReference(context.supabase as never, data.eventId, data.kind);
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

export type AgendaReferenceSummary = { eventId: string; hasPhoto: boolean; linkUrl: string | null };

/**
 * Leitura agregada (uma consulta só) das referências do imóvel para a listagem
 * da Agenda de Fotos — evita uma consulta por card.
 */
export const listAgendaReferenceSummaries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data?: { eventIds?: string[] }) => data ?? {})
  .handler(async ({ data, context }): Promise<AgendaReferenceSummary[]> => {
    const ids = (data?.eventIds ?? []).filter(Boolean).slice(0, 500);
    if (ids.length === 0) return [];
    const { data: rows, error } = await context.supabase
      .from("agenda_event_attachments")
      .select("event_id,kind,url")
      .eq("purpose", "property_reference")
      .in("event_id", ids);
    if (error) throw new Error(error.message);
    const map = new Map<string, AgendaReferenceSummary>();
    for (const row of (rows ?? []) as Array<{
      event_id: string;
      kind: string;
      url: string | null;
    }>) {
      const current =
        map.get(row.event_id) ?? { eventId: row.event_id, hasPhoto: false, linkUrl: null };
      if (row.kind === "foto") current.hasPhoto = true;
      if (row.kind === "link" && row.url) current.linkUrl = row.url;
      map.set(row.event_id, current);
    }
    return Array.from(map.values());
  });
