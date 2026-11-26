import { Camera, ChevronLeft, Images, Loader2, RotateCcw, Zap, ZapOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Range = { min: number; max: number; step?: number };
type CameraState = { phase: "opening" | "live" | "recovery"; message: string };
const OPENING: CameraState = { phase: "opening", message: "Abrindo a câmera…" };
const INTERRUPTED =
  "A câmera foi interrompida. Toque em Tentar novamente para voltar à imagem ao vivo.";
const PLAYBACK_FAILED =
  "A câmera foi aberta, mas a imagem ao vivo não iniciou. Tente novamente ou use a câmera do celular.";
const OPEN_TIMEOUT_MS = 10_000;
const optionClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/30 px-3 text-sm font-medium hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

export function cameraErrorMessage(error: unknown) {
  switch ((error as { name?: string })?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return window.top !== window
        ? "Esta prévia pode bloquear a câmera. Abra o Gestão em uma aba própria ou escolha da galeria."
        : "O navegador bloqueou a câmera. Confira a permissão deste site e tente novamente.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Nenhuma câmera disponível foi encontrada neste aparelho.";
    case "NotReadableError":
    case "AbortError":
      return "A câmera pode estar em uso por outro aplicativo. Feche-o e tente novamente.";
    default:
      return "Não foi possível acessar a câmera. Tente novamente ou escolha da galeria.";
  }
}

function hasFrame(video: HTMLVideoElement) {
  return !video.paused && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
}

function waitForFrame(video: HTMLVideoElement, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const events = ["loadeddata", "playing", "resize", "canplay", "timeupdate"];
    const cleanup = () => {
      events.forEach((event) => video.removeEventListener(event, check));
      signal.removeEventListener("abort", cancel);
    };
    const cancel = () => {
      cleanup();
      reject(signal.reason);
    };
    const check = () => {
      if (!hasFrame(video)) return;
      cleanup();
      resolve();
    };
    events.forEach((event) => video.addEventListener(event, check));
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    else check();
  });
}

type CameraProps = {
  title: string;
  count: number;
  onClose: () => void;
  onCapture: (video: HTMLVideoElement) => Promise<Blob | null>;
  onNative: () => void;
  onGallery: () => void;
};

export function InAppCamera({ open, ...props }: CameraProps & { open: boolean }) {
  return open ? <CameraPanel {...props} /> : null;
}

function CameraPanel({ title, count, onClose, onCapture, onNative, onGallery }: CameraProps) {
  const panel = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const attempt = useRef<AbortController | null>(null);
  const opening = useRef<Promise<MediaStream> | null>(null);
  const [state, setState] = useState<CameraState>(OPENING);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const [torch, setTorch] = useState<boolean | null>(null);
  const [zoom, setZoom] = useState<(Range & { value: number }) | null>(null);
  const [last, setLast] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const stop = useCallback(() => {
    attempt.current?.abort();
    attempt.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const recover = useCallback(
    (message: string) => {
      stop();
      setState({ phase: "recovery", message });
      setTorch(null);
      setZoom(null);
    },
    [stop],
  );

  const start = useCallback(async () => {
    if (attempt.current || document.hidden) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      recover(
        window.top !== window
          ? "Abra o Gestão em uma aba própria para usar a câmera do app."
          : "A câmera do app está indisponível neste navegador.",
      );
      return;
    }
    const session = new AbortController();
    const started = performance.now();
    attempt.current = session;
    const { signal } = session;
    setState(OPENING);
    setCaptureError("");
    let stage: "permission" | "playback" = "permission";
    const timer = window.setTimeout(() => {
      recover(
        stage === "permission"
          ? "A câmera demorou para responder. Confira o aviso do navegador ou escolha outra opção."
          : PLAYBACK_FAILED,
      );
    }, OPEN_TIMEOUT_MS);
    signal.addEventListener("abort", () => window.clearTimeout(timer), { once: true });
    try {
      // O navegador pode manter getUserMedia pendente enquanto aguarda a pessoa.
      // Se houver uma tentativa abandonada, espere a liberação do stream antes de pedir outro.
      if (opening.current) await opening.current.catch(() => undefined);
      if (signal.aborted) return;
      const request = navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        },
      });
      opening.current = request;
      const stream = await request.finally(() => {
        if (opening.current === request) opening.current = null;
      });
      const video = videoRef.current;
      if (signal.aborted || !video || document.visibilityState === "hidden") {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState === "ended") throw new DOMException("", "NotFoundError");
      stage = "playback";
      const interrupt = () => recover(INTERRUPTED);
      track.addEventListener("ended", interrupt, { signal });
      video.addEventListener("error", interrupt, { signal });
      video.muted = true;
      video.srcObject = stream;
      await video.play();
      if (signal.aborted) return;
      await waitForFrame(video, signal);
      if (signal.aborted) return;
      track.addEventListener("mute", interrupt, { signal });
      video.addEventListener("pause", interrupt, { signal });
      if (track.muted || !hasFrame(video)) {
        recover(INTERRUPTED);
        return;
      }
      const caps = track.getCapabilities?.() as
        | (MediaTrackCapabilities & { torch?: boolean; zoom?: Range })
        | undefined;
      const settings = track.getSettings?.() as
        | (MediaTrackSettings & { zoom?: number })
        | undefined;
      setTorch(caps?.torch === true ? false : null);
      if (caps?.zoom && caps.zoom.max > caps.zoom.min)
        setZoom({ ...caps.zoom, value: settings?.zoom ?? caps.zoom.min });
      if (import.meta.env.DEV)
        console.debug("[vistoria] câmera pronta", {
          width: video.videoWidth,
          height: video.videoHeight,
          ms: Math.round(performance.now() - started),
        });
      setState({ phase: "live", message: "" });
    } catch (e) {
      if (import.meta.env.DEV && !signal.aborted)
        console.debug("[vistoria] abertura da câmera", {
          stage,
          error: (e as Error).name,
          ms: Math.round(performance.now() - started),
        });
      if (!signal.aborted) recover(stage === "playback" ? PLAYBACK_FAILED : cameraErrorMessage(e));
    } finally {
      window.clearTimeout(timer);
    }
  }, [recover]);

  useEffect(() => {
    const dialog = panel.current;
    dialog?.showModal();
    const suspend = () => recover(INTERRUPTED);
    const visibility = () => {
      if (document.visibilityState === "hidden") suspend();
    };
    if (document.visibilityState === "hidden") suspend();
    else void start();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", suspend);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", suspend);
      stop();
      dialog?.close();
    };
  }, [recover, start, stop]);

  useEffect(() => {
    if (!last) return;
    const url = URL.createObjectURL(last);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [last]);

  function leave(next: () => void) {
    stop();
    panel.current?.close();
    next();
  }

  async function shoot() {
    const video = videoRef.current;
    const signal = attempt.current?.signal;
    if (busyRef.current || !video || !signal || state.phase !== "live") return;
    if (!hasFrame(video)) {
      recover(INTERRUPTED);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setCaptureError("");
    try {
      const thumb = await onCapture(video);
      if (thumb && !signal.aborted) setLast(thumb);
    } catch (e) {
      if (!signal.aborted)
        setCaptureError(e instanceof Error ? e.message : "Não foi possível guardar a foto.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    const signal = attempt.current?.signal;
    if (!track || !signal || torch === null) return;
    const value = !torch;
    try {
      await track.applyConstraints({ advanced: [{ torch: value } as MediaTrackConstraintSet] });
      const applied = (track.getSettings?.() as { torch?: boolean } | undefined)?.torch;
      if (!signal.aborted) setTorch(applied === undefined || applied === value ? value : null);
    } catch {
      if (!signal.aborted) setTorch(null);
    }
  }

  async function changeZoom(value: number) {
    const track = streamRef.current?.getVideoTracks()[0];
    const signal = attempt.current?.signal;
    if (!track || !signal || !zoom) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
      const applied = (track.getSettings?.() as { zoom?: number } | undefined)?.zoom;
      if (!signal.aborted)
        setZoom(
          applied === zoom.value && value !== zoom.value
            ? null
            : { ...zoom, value: applied ?? value },
        );
    } catch {
      if (!signal.aborted) setZoom(null);
    }
  }

  return (
    <dialog
      ref={panel}
      aria-label="Câmera do app"
      onCancel={(e) => {
        e.preventDefault();
        leave(onClose);
      }}
      className="fixed inset-0 m-0 size-full max-h-none max-w-none overflow-y-auto bg-[#161e24] text-white backdrop:bg-[#161e24] open:flex open:flex-col"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p className="break-words text-base font-semibold">{title}</p>
          <p aria-live="polite" className="text-sm text-white/80">
            {count} {count === 1 ? "foto neste cômodo" : "fotos neste cômodo"}
          </p>
        </div>
        <button type="button" onClick={() => leave(onClose)} className={optionClass}>
          <ChevronLeft className="size-4" aria-hidden /> Voltar ao cômodo
        </button>
      </div>
      <div className="relative flex min-h-36 flex-1 justify-center overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          aria-hidden
          className="absolute inset-0 size-full object-contain"
        />
        {state.phase !== "live" && (
          <div
            role="status"
            className="z-10 m-auto flex max-w-sm flex-col items-center gap-3 px-5 py-4 text-center"
          >
            {state.phase === "opening" && <Loader2 className="size-5 animate-spin" aria-hidden />}
            <p>{state.message}</p>
          </div>
        )}
      </div>
      {state.phase === "live" && zoom && (
        <input
          type="range"
          aria-label="Zoom"
          className="mx-auto min-h-11 w-[min(20rem,85%)] accent-white"
          min={zoom.min}
          max={zoom.max}
          step={zoom.step || 0.1}
          value={zoom.value}
          onChange={(e) => void changeZoom(Number(e.target.value))}
        />
      )}
      <div className="mx-auto w-full max-w-xl space-y-3 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {captureError && (
          <p role="alert" className="text-center text-sm text-red-200">
            {captureError}
          </p>
        )}
        {state.phase === "live" && (
          <div className="grid grid-cols-3 items-center gap-2">
            {preview ? (
              <img
                src={preview}
                alt="Última foto salva"
                className="size-12 rounded-lg object-cover"
              />
            ) : (
              <span />
            )}
            <button
              type="button"
              aria-label={busy ? "Salvando foto" : "Tirar foto"}
              disabled={busy}
              onClick={() => void shoot()}
              className="mx-auto grid size-16 place-items-center rounded-full border-4 border-white bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="size-7 animate-spin" aria-hidden />
              ) : (
                <Camera className="size-7" aria-hidden />
              )}
            </button>
            {torch !== null && (
              <button
                type="button"
                aria-label="Lanterna"
                aria-pressed={torch}
                onClick={() => void toggleTorch()}
                className={`ml-auto size-11 ${optionClass}`}
              >
                {torch ? (
                  <ZapOff className="size-5" aria-hidden />
                ) : (
                  <Zap className="size-5" aria-hidden />
                )}
              </button>
            )}
          </div>
        )}
        {busy && (
          <p role="status" className="text-center text-sm">
            Salvando foto no aparelho…
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {state.phase === "recovery" && (
            <button type="button" onClick={() => void start()} className={optionClass}>
              <RotateCcw className="size-4" aria-hidden /> Tentar novamente
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => leave(onNative)}
            className={optionClass}
          >
            <Camera className="size-4" aria-hidden /> Usar câmera do celular
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => leave(onGallery)}
            className={optionClass}
          >
            <Images className="size-4" aria-hidden /> Escolher da galeria
          </button>
        </div>
      </div>
    </dialog>
  );
}
