// Formato real do áudio do relato: tipo → extensão e nome enviado à transcrição.

export type AudioExt = "wav" | "webm" | "m4a" | "ogg" | "mp4";

const BY_MIME: Record<string, AudioExt> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/vnd.wave": "wav",
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "m4a",
  "video/mp4": "m4a",
  "audio/ogg": "ogg",
  "application/ogg": "ogg",
};

export const MIME_BY_EXT: Record<AudioExt, string> = {
  wav: "audio/wav",
  webm: "audio/webm",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  ogg: "audio/ogg",
};

/** Normaliza "audio/webm;codecs=opus" → "audio/webm". */
export function baseMime(mime: string | null | undefined): string {
  return (mime ?? "").split(";")[0]!.trim().toLowerCase();
}

export function extFromMime(mime: string | null | undefined): AudioExt | null {
  return BY_MIME[baseMime(mime)] ?? null;
}

export function extFromPath(path: string | null | undefined): AudioExt | null {
  const m = /\.([a-z0-9]+)$/i.exec(path ?? "");
  const e = m?.[1]?.toLowerCase();
  return e === "wav" || e === "webm" || e === "m4a" || e === "ogg" || e === "mp4" ? e : null;
}

/** Tipo real: nota → arquivo → extensão do caminho; WAV por último. */
export function resolveAudioFormat(input: {
  noteMime?: string | null;
  blobMime?: string | null;
  path?: string | null;
}): { ext: AudioExt; mime: string; filename: string } {
  const ext =
    extFromMime(input.noteMime) ?? extFromMime(input.blobMime) ?? extFromPath(input.path) ?? "wav";
  const out = ext === "mp4" ? "m4a" : ext;
  return { ext: out, mime: MIME_BY_EXT[out], filename: `relato.${out}` };
}
