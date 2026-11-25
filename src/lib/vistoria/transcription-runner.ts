// Regras puras da transcrição automática dos relatos de voz.

export const MAX_TRANSCRIPTION_ATTEMPTS = 5;

export type TranscribableNote = {
  id: string;
  source: "voz" | "texto";
  audio_path: string | null;
  transcript_original: string | null;
  status: string;
  transcription_state?: string | null;
  transcription_error?: string | null;
  transcription_attempts?: number | null;
  transcription_next_at?: string | null;
  transcription_lease_until?: string | null;
};

export type TranscriptionView =
  | "nenhum"
  | "pendente"
  | "transcrevendo"
  | "interrompida"
  | "falhou"
  | "esgotada"
  | "concluida";

const ts = (v: string | null | undefined) => (v ? Date.parse(v) : NaN);

/** Estado efetivo. Notas de texto e notas de voz sem áudio nunca entram na transcrição. */
export function transcriptionView(n: TranscribableNote, now: number): TranscriptionView {
  if (n.source !== "voz" || !n.audio_path) return "nenhum";
  if (n.transcript_original) return "concluida";
  const st = n.transcription_state ?? null;
  if (st === "concluida") return "concluida";
  if (st === "transcrevendo") return ts(n.transcription_lease_until) > now ? "transcrevendo" : "interrompida";
  if (st === "falhou")
    return (n.transcription_attempts ?? 0) >= MAX_TRANSCRIPTION_ATTEMPTS ? "esgotada" : "falhou";
  // 'pendente' ou notas antigas sem estado (NULL): só enquanto aguardam transcrição.
  return n.status === "pendente_transcricao" ? "pendente" : "nenhum";
}

/** Pode ser disparada automaticamente agora? */
export function isAutoRunnable(n: TranscribableNote, now: number, localWaitUntil = 0): boolean {
  const v = transcriptionView(n, now);
  if (v !== "pendente" && v !== "interrompida" && v !== "falhou") return false;
  if (localWaitUntil > now) return false;
  const next = ts(n.transcription_next_at);
  return !(next > now);
}

export function pickNextTranscription(
  notes: TranscribableNote[],
  now: number,
  localWait: Map<string, number> = new Map(),
): TranscribableNote | null {
  return notes.find((n) => isAutoRunnable(n, now, localWait.get(n.id) ?? 0)) ?? null;
}

/** Em quanto tempo reavaliar (prazo de reserva ou próxima tentativa); null = nada esperando. */
export function nextTranscriptionWake(
  notes: TranscribableNote[],
  now: number,
  localWait: Map<string, number> = new Map(),
): number | null {
  let best: number | null = null;
  const consider = (t: number) => {
    if (t > now && (best === null || t - now < best)) best = t - now;
  };
  for (const n of notes) {
    const v = transcriptionView(n, now);
    if (v === "transcrevendo") consider(ts(n.transcription_lease_until));
    if (v === "falhou" || v === "pendente" || v === "interrompida") {
      consider(ts(n.transcription_next_at));
      consider(localWait.get(n.id) ?? 0);
    }
  }
  return best;
}

/** 402/429/5xx/rede/tempo esgotado → tenta depois sem gastar tentativa. */
export function isRetryableStatus(status: number): boolean {
  return status === 402 || status === 429 || status === 408 || status >= 500 || status === 0;
}

export type TranscriptionLabel = { text: string; spinner: boolean; retry: boolean };

export function transcriptionLabel(
  view: TranscriptionView,
  opts: { voiceReady: boolean; isAdmin: boolean; error?: string | null },
): TranscriptionLabel | null {
  if (view === "nenhum" || view === "concluida") return null;
  if (!opts.voiceReady)
    return {
      text:
        "Transcrição indisponível no momento. O áudio está salvo." +
        (opts.isAdmin ? " A transcrição está desligada no servidor." : ""),
      spinner: false,
      retry: false,
    };
  if (view === "pendente") return { text: "Aguardando transcrição", spinner: false, retry: false };
  if (view === "transcrevendo") return { text: "Transcrevendo…", spinner: true, retry: false };
  if (view === "interrompida")
    return { text: "A transcrição foi interrompida.", spinner: false, retry: true };
  const reason = (opts.error ?? "").trim() || "tente de novo em instantes.";
  return { text: `Não foi possível transcrever: ${reason}`, spinner: false, retry: true };
}
