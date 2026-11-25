import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

const BUCKET = "inspection-media";

async function isAdmin(sb: any, userId: string): Promise<boolean> {
  const { data } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
  return data === true;
}

/** Estado da voz. A lista de pendências técnicas só vai para administradores. */
export const getVoiceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { voiceStatus } = await import("./voice.server");
    const st = voiceStatus();
    const admin = await isAdmin(context.supabase as any, context.userId);
    if (admin) return { ...st, isAdmin: true };
    return {
      transcribe: { ready: st.transcribe.ready, missing: [] as string[], model: st.transcribe.model },
      live: { ready: st.live.ready, missing: [] as string[], model: st.live.model },
      isAdmin: false,
    };
  });

/** Lê um intervalo do áudio pela URL assinada; devolve bytes e tamanho total. */
async function rangeReader(sb: any, path: string) {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error("Áudio não encontrado no armazenamento.");
  const url: string = data.signedUrl;
  return async (start: number, end: number) => {
    const res = await fetch(url, {
      headers: { Range: `bytes=${start}-${Math.max(start, end - 1)}` },
      signal: AbortSignal.timeout(2 * 60_000),
    });
    if (!res.ok && res.status !== 206) throw Object.assign(new Error("áudio indisponível no armazenamento."), { status: res.status >= 500 ? res.status : 400 });
    const cr = res.headers.get("content-range");
    const total = cr ? Number(cr.split("/")[1]) : Number(res.headers.get("content-length") ?? 0);
    const max = end - start;
    const reader = res.body!.getReader();
    const out = new Uint8Array(max);
    let n = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const take = Math.min(value.byteLength, max - n);
      out.set(value.subarray(0, take), n);
      n += take;
      if (n >= max) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
    return { bytes: out.subarray(0, n), total: Number.isFinite(total) && total > 0 ? total : n };
  };
}

/**
 * Transcreve um relato de voz salvo no armazenamento privado e grava a
 * transcrição + sugestão no próprio relato. Reserva com prazo impede duas
 * transcrições simultâneas. Nada é aplicado aos itens.
 */
export const transcribeNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ noteId: z.string().uuid(), manual: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const voice = await import("./voice.server");
    if (!voice.voiceStatus().transcribe.ready) throw new Error("Transcrição indisponível no momento. O áudio está salvo.");
    const { data: note, error } = await sb
      .from("inspection_notes")
      .select("*")
      .eq("id", data.noteId)
      .maybeSingle();
    if (error || !note) throw new Error("Relato não encontrado ou sem acesso.");
    if (note.source !== "voz" || !note.audio_path || note.transcript_original) return note;
    if (data.manual && note.transcription_state === "falhou") {
      // "Tentar de novo": libera a espera e o limite (não muda revisões).
      await sb
        .from("inspection_notes")
        .update({ transcription_next_at: null, transcription_attempts: 0 })
        .eq("id", note.id)
        .eq("transcription_state", "falhou");
    }
    const { data: room } = await sb.from("inspection_rooms").select("name").eq("id", note.room_id).maybeSingle();
    const { runNoteTranscription } = await import("./transcription-pipeline");
    const result = await runNoteTranscription(note, {
      readRange: await rangeReader(sb, note.audio_path),
      claim: async (segments) => {
        const { data: rows, error: ce } = await sb.rpc("inspection_note_transcription_claim", {
          p_note: note.id,
          p_segments: segments,
        });
        if (ce) throw new Error(ce.code === "42501" ? "Vistoria concluída ou sem acesso para edição." : "Não foi possível reservar a transcrição.");
        const r = Array.isArray(rows) ? rows[0] : rows;
        return { claimed: Boolean(r?.claimed), token: r?.lease_token ?? null, note: r?.note ?? note };
      },
      renew: async (token) => {
        const { data: ok } = await sb.rpc("inspection_note_transcription_renew", { p_note: note.id, p_token: token });
        return ok === true;
      },
      finish: async (token, r) => {
        const { data: row, error: fe } = await sb.rpc("inspection_note_transcription_finish", {
          p_note: note.id,
          p_token: token,
          p_transcript: r.transcript,
          p_suggestion: r.suggestion,
          p_error: r.error,
          p_retryable: r.retryable,
        });
        if (fe) throw new Error("Não foi possível salvar a transcrição.");
        return row;
      },
      transcribe: (file, filename) => voice.transcribeAudio(file, filename),
      organize: async (t) => ({ observacoes: await voice.organizeTranscript(t, room?.name ?? "Ambiente") }),
    });
    return (result as any) ?? null;
  });

/**
 * Exclui um relato de voz: linha primeiro (cancela reserva/transcrição), depois o
 * arquivo. Arquivo que não sair fica registrado em inspection_events.
 */
export const deleteVoiceNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ noteId: z.string().uuid(), reason: z.enum(["excluir", "regravar"]).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: note, error } = await sb
      .from("inspection_notes")
      .select("id, inspection_id, room_id, client_key, source, audio_path")
      .eq("id", data.noteId)
      .maybeSingle();
    if (error || !note) throw new Error("Relato não encontrado ou sem acesso.");
    if (note.source !== "voz") throw new Error("Só relatos de voz podem ser excluídos aqui.");
    if (note.audio_path && (note.audio_path.split("/")[1] === "docs" || note.audio_path.includes("..")))
      throw new Error("Arquivo protegido.");
    const { data: canEdit } = await sb.rpc("inspection_can_edit", { p_id: note.inspection_id });
    if (!canEdit) throw new Error("Vistoria concluída ou sem acesso para edição.");
    const { data: gone, error: de } = await sb.from("inspection_notes").delete().eq("id", note.id).select("id");
    if (de || !gone?.length) throw new Error("Não foi possível excluir o áudio.");
    const event = (name: string, details: Record<string, unknown>) =>
      sb
        .from("inspection_events")
        .insert({ inspection_id: note.inspection_id, event: name, details, actor_id: context.userId })
        .then(() => undefined, () => undefined);
    let orphan = false;
    if (note.audio_path) {
      const { error: se } = await sb.storage.from(BUCKET).remove([note.audio_path]);
      if (se) {
        orphan = true;
        await event("note_audio_orphan", { note_id: note.id, audio_path: note.audio_path });
      }
    }
    await event("note_deleted", { note_id: note.id, room_id: note.room_id, reason: data.reason ?? "excluir" });
    return { ok: true as const, clientKey: note.client_key as string, orphan };
  });
