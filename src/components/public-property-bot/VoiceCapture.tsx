import { useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";
import type { BotBrand } from "@/lib/public-property-bot/contracts";
import { transcribe } from "./transport";
export const VOICE_MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"] as const;
export function recorderMime(Recorder: Pick<typeof MediaRecorder, "isTypeSupported">) {
  return VOICE_MIME_TYPES.find((type) => Recorder.isTypeSupported(type)) ?? null;
}
type Props = {
  brand: BotBrand;
  enabled: boolean;
  active: boolean;
  blocked: boolean;
  onText(text: string): void;
  onStatus(status: "idle" | "permission" | "recording" | "transcribing"): void;
};
export default function VoiceCapture({ brand, enabled, active, blocked, onText, onStatus }: Props) {
  const [phase, setPhase] = useState<"idle" | "permission" | "recording" | "transcribing">("idle");
  const [seconds, setSeconds] = useState(0),
    [error, setError] = useState("");
  const stream = useRef<MediaStream | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    pending = useRef<AbortController | null>(null);
  const generation = useRef(0),
    timeout = useRef<ReturnType<typeof setTimeout> | null>(null),
    interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const supported =
    typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  function release() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (timeout.current) clearTimeout(timeout.current);
    if (interval.current) clearInterval(interval.current);
    timeout.current = null;
    interval.current = null;
  }
  function cancel() {
    generation.current++;
    pending.current?.abort();
    pending.current = null;
    const current = recorder.current;
    recorder.current = null;
    if (current && current.state !== "inactive") current.stop();
    release();
    setPhase("idle");
    onStatus("idle");
  }
  useEffect(() => {
    if (!active) cancel();
  }, [active]);
  useEffect(
    () => () => {
      generation.current++;
      pending.current?.abort();
      if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
      release();
    },
    [],
  );
  async function start() {
    if (!enabled || blocked || !supported || phase !== "idle") return;
    const mime = recorderMime(MediaRecorder);
    if (!mime) {
      setError(
        "Este navegador não oferece um formato de áudio compatível. Você pode digitar o pedido.",
      );
      return;
    }
    const run = ++generation.current;
    setError("");
    setPhase("permission");
    onStatus("permission");
    try {
      const capture = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (run !== generation.current) {
        capture.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = capture;
      const audio = new MediaRecorder(capture, { mimeType: mime, audioBitsPerSecond: 64000 });
      recorder.current = audio;
      const parts: Blob[] = [];
      let bytes = 0;
      audio.ondataavailable = (event) => {
        if (event.data.size && run === generation.current) {
          bytes += event.data.size;
          if (bytes > 10 * 1024 * 1024) {
            cancel();
            setError("A gravação ficou muito grande. Grave uma mensagem mais curta.");
            return;
          }
          parts.push(event.data);
        }
      };
      audio.onerror = () => {
        if (run === generation.current) {
          cancel();
          setError("O microfone parou. Você pode tentar novamente ou digitar.");
        }
      };
      audio.onstop = async () => {
        if (run !== generation.current) return;
        release();
        recorder.current = null;
        if (!parts.length || bytes < 100) {
          setPhase("idle");
          onStatus("idle");
          setError("Não consegui ouvir. Grave novamente ou digite o pedido.");
          return;
        }
        setPhase("transcribing");
        onStatus("transcribing");
        const controller = new AbortController();
        pending.current = controller;
        try {
          const text = await transcribe(
            brand,
            new Blob(parts, { type: audio.mimeType || mime }),
            crypto.randomUUID(),
            controller.signal,
          );
          if (run === generation.current) {
            onText(text);
            setPhase("idle");
            onStatus("idle");
          }
        } catch {
          if (run === generation.current) {
            setPhase("idle");
            onStatus("idle");
            setError(
              "Não consegui transcrever. Seu texto foi mantido; tente gravar novamente ou digite.",
            );
          }
        } finally {
          if (pending.current === controller) pending.current = null;
        }
      };
      audio.start(250);
      setSeconds(0);
      setPhase("recording");
      onStatus("recording");
      const started = Date.now();
      interval.current = setInterval(
        () => setSeconds(Math.min(60, Math.floor((Date.now() - started) / 1000))),
        250,
      );
      timeout.current = setTimeout(() => {
        if (audio.state !== "inactive") audio.stop();
      }, 60000);
    } catch (reason) {
      if (run !== generation.current) return;
      release();
      setPhase("idle");
      onStatus("idle");
      setError(
        reason instanceof DOMException && reason.name === "NotAllowedError"
          ? "O microfone não foi autorizado. Você pode liberar a permissão no navegador ou digitar."
          : "Não consegui acessar o microfone. Confira a conexão e tente novamente ou digite.",
      );
    }
  }
  return (
    <div className="ppb-voice">
      {phase === "idle" ? (
        <button
          type="button"
          className="ppb-icon"
          disabled={!enabled || blocked || !supported}
          onClick={() => void start()}
          aria-label="Gravar mensagem de voz"
          title={
            !enabled
              ? "Voz indisponível agora"
              : !supported
                ? "Gravação não suportada neste navegador"
                : "Gravar mensagem de voz"
          }
        >
          <Mic size={20} />
        </button>
      ) : (
        <div className="ppb-recording">
          <span role="status">
            {phase === "permission"
              ? "Aguardando microfone…"
              : phase === "transcribing"
                ? "Transcrevendo…"
                : `Gravando · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
          </span>
          {phase === "recording" && (
            <button
              type="button"
              className="ppb-icon"
              aria-label="Parar gravação e transcrever"
              onClick={() => {
                if (recorder.current?.state === "recording") recorder.current.stop();
              }}
            >
              <Square size={16} />
            </button>
          )}
          <button type="button" className="ppb-icon" aria-label="Cancelar áudio" onClick={cancel}>
            <X size={18} />
          </button>
        </div>
      )}
      {error && (
        <p className="ppb-voice-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
