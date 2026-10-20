import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const getVoiceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { voiceStatus } = await import("./voice.server");
    return voiceStatus();
  });

/**
 * Transcreve um relato de voz já salvo no armazenamento privado e grava a
 * transcrição original + sugestão organizada no próprio relato (cômodo de origem).
 * Nada é aplicado aos itens: o vistoriador revisa e aplica explicitamente.
 */
export const transcribeNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ noteId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: note, error } = await sb
      .from("inspection_notes")
      .select("id, inspection_id, room_id, audio_path, audio_mime, transcript_original, suggestion, status, revision")
      .eq("id", data.noteId)
      .maybeSingle();
    if (error || !note) throw new Error("Relato não encontrado ou sem acesso.");
    const { data: canEdit } = await sb.rpc("inspection_can_edit", { p_id: note.inspection_id });
    if (!canEdit) throw new Error("Vistoria concluída ou sem acesso para edição.");
    if (note.status !== "pendente_transcricao" && note.transcript_original) return note; // idempotente
    const { data: room } = await sb.from("inspection_rooms").select("name").eq("id", note.room_id).maybeSingle();
    const voice = await import("./voice.server");
    let transcript = note.transcript_original as string | null;
    if (!transcript) {
      if (!note.audio_path) throw new Error("Relato sem áudio.");
      const { data: blob, error: de } = await sb.storage.from("inspection-media").download(note.audio_path);
      if (de || !blob) throw new Error("Áudio não encontrado no armazenamento.");
      const name = note.audio_path.split("/").pop() || "relato.wav";
      const typed = new Blob([await (blob as Blob).arrayBuffer()], { type: note.audio_mime || "audio/wav" });
      try {
        transcript = await voice.transcribeAudio(typed, name);
      } catch (e) {
        throw new Error(e instanceof Error ? e.message : "Falha na transcrição.");
      }
      if (!transcript) throw new Error("Não foi possível entender o áudio. Grave novamente ou digite.");
    }
    let suggestion: unknown = null;
    try {
      suggestion = { observacoes: await voice.organizeTranscript(transcript, room?.name ?? "Ambiente") };
    } catch {
      suggestion = null; // a transcrição continua válida mesmo sem a organização
    }
    const { data: rows, error: ue } = await sb
      .from("inspection_notes")
      .update({ transcript_original: transcript, suggestion, status: "transcrito" })
      .eq("id", note.id)
      .eq("revision", note.revision)
      .select("*");
    if (ue) throw new Error(ue.message);
    if (!rows?.length) {
      const { data: fresh } = await sb.from("inspection_notes").select("*").eq("id", note.id).maybeSingle();
      return fresh;
    }
    return rows[0];
  });
