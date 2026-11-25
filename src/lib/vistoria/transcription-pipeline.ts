// Orquestração da transcrição de um relato (sem dependência de rede: tudo injetado).
// Reserva → leitura por intervalo → transcrição em ordem → organização opcional → conclusão.

import { resolveAudioFormat } from "./audio-format";
import { isRetryableStatus } from "./transcription-runner";
import {
  OTHER_MAX_BYTES,
  parseWavHeader,
  planWavSegments,
  SEGMENT_MAX_BYTES,
  WAV_MAX_BYTES,
  wavSegmentHeader,
} from "./wav-split";

export const HEADER_PROBE_BYTES = 64 * 1024;

export type PipelineNote = {
  id: string;
  audio_path: string;
  audio_mime: string | null;
};

export type RangeResult = { bytes: Uint8Array; total: number };

export type PipelineDeps = {
  /** Lê [start, end) do áudio; devolve também o tamanho total do arquivo. */
  readRange: (start: number, end: number) => Promise<RangeResult>;
  claim: (segments: number) => Promise<{ claimed: boolean; token: string | null; note: unknown }>;
  renew: (token: string) => Promise<boolean>;
  finish: (
    token: string,
    r: { transcript: string | null; suggestion: unknown; error: string | null; retryable: boolean },
  ) => Promise<unknown>;
  transcribe: (file: Blob, filename: string) => Promise<string>;
  organize: (transcript: string) => Promise<unknown>;
};

export class PipelineFailure extends Error {
  constructor(
    message: string,
    public retryable: boolean,
  ) {
    super(message);
  }
}

function failureOf(e: unknown): PipelineFailure {
  if (e instanceof PipelineFailure) return e;
  const status = typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : 0;
  const msg = e instanceof Error && e.message ? e.message : "o serviço de transcrição falhou.";
  return new PipelineFailure(msg.slice(0, 200), isRetryableStatus(status));
}

type Plan = { filename: string; mime: string; parts: Array<{ start: number; end: number; header?: Uint8Array }> };

async function plan(note: PipelineNote, deps: PipelineDeps): Promise<Plan> {
  const fmt = resolveAudioFormat({ noteMime: note.audio_mime, path: note.audio_path });
  const probe = await deps.readRange(0, HEADER_PROBE_BYTES);
  const total = probe.total;
  if (fmt.ext !== "wav") {
    if (total > OTHER_MAX_BYTES)
      throw new PipelineFailure("Áudio muito longo para transcrever. Grave em partes menores.", false);
    return { filename: fmt.filename, mime: fmt.mime, parts: [{ start: 0, end: total }] };
  }
  if (total > WAV_MAX_BYTES)
    throw new PipelineFailure("Áudio muito longo para transcrever. Grave em partes menores.", false);
  if (total <= SEGMENT_MAX_BYTES)
    return { filename: fmt.filename, mime: fmt.mime, parts: [{ start: 0, end: total }] };
  const info = parseWavHeader(probe.bytes, total);
  if (!info) throw new PipelineFailure("o áudio não pôde ser lido. Grave novamente ou digite.", false);
  const parts = planWavSegments(info).map((r) => ({
    ...r,
    header: wavSegmentHeader(info, r.end - r.start),
  }));
  return { filename: fmt.filename, mime: fmt.mime, parts };
}

/**
 * Transcreve um relato. Devolve o resultado de `finish` (nota atualizada) ou o
 * estado atual quando outra tela já reservou/concluiu.
 */
export async function runNoteTranscription(note: PipelineNote, deps: PipelineDeps): Promise<unknown> {
  let p: Plan | null = null;
  let planError: PipelineFailure | null = null;
  try {
    p = await plan(note, deps);
  } catch (e) {
    planError = failureOf(e);
  }
  const claim = await deps.claim(p?.parts.length ?? 1);
  if (!claim.claimed || !claim.token) return claim.note;
  const token = claim.token;
  if (planError || !p)
    return deps.finish(token, {
      transcript: null,
      suggestion: null,
      error: planError?.message ?? "o áudio não pôde ser lido.",
      retryable: planError?.retryable ?? false,
    });
  try {
    const texts: string[] = [];
    for (let i = 0; i < p.parts.length; i++) {
      if (i > 0 && !(await deps.renew(token))) return null; // reserva perdida: não grava nada
      const part = p.parts[i]!;
      const { bytes } = await deps.readRange(part.start, part.end);
      const chunks: BlobPart[] = part.header ? [part.header as BlobPart, bytes as BlobPart] : [bytes as BlobPart];
      const text = await deps.transcribe(new Blob(chunks, { type: p.mime }), p.filename);
      if (text.trim()) texts.push(text.trim());
    }
    const transcript = texts.join(" ").trim();
    if (!transcript)
      return deps.finish(token, {
        transcript: null,
        suggestion: null,
        error: "não foi possível entender o áudio. Grave novamente ou digite.",
        retryable: false,
      });
    let suggestion: unknown = null;
    try {
      suggestion = await deps.organize(transcript);
    } catch {
      suggestion = null; // organização nunca invalida a transcrição
    }
    return deps.finish(token, { transcript, suggestion, error: null, retryable: false });
  } catch (e) {
    const f = failureOf(e);
    return deps.finish(token, { transcript: null, suggestion: null, error: f.message, retryable: f.retryable });
  }
}
