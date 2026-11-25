// Câmera dentro do app: tira várias fotos sem sair da página (evita que o
// Android feche a aba ao abrir a câmera nativa). Toda foto passa depois pela
// preparação reduzida antes de ir para a fila.
import { Camera, Check, Loader2, Zap, ZapOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export const CAMERA_INTRO = "Para tirar fotos sem sair da vistoria, permita o uso da câmera.";
export const CAMERA_FAILED =
  "Não foi possível abrir a câmera do app. Use a câmera do celular ou a galeria.";
const TARGET_WIDTH = 2048;

export function supportsInAppCamera(nav: Navigator | undefined = globalThis.navigator) {
  return Boolean(nav?.mediaDevices && typeof nav.mediaDevices.getUserMedia === "function");
}

type Range = { min?: number; max?: number; step?: number };
/** Largura pedida ao takePhoto: até ~2048 px dentro da faixa do aparelho. */
export function pickPhotoWidth(range: Range | undefined): number | null {
  if (!range || !range.max) return null;
  const min = range.min ?? 1;
  let w = Math.min(range.max, Math.max(min, TARGET_WIDTH));
  if (range.step && range.step > 1) w = min + Math.floor((w - min) / range.step) * range.step;
  return w;
}

type ImageCaptureLike = {
  getPhotoCapabilities?: () => Promise<{ imageWidth?: Range }>;
  takePhoto: (s?: { imageWidth?: number }) => Promise<Blob>;
};
type ImageCaptureCtor = new (t: MediaStreamTrack) => ImageCaptureLike;

async function frameFromVideo(video: HTMLVideoElement): Promise<Blob> {
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 960;
  const scale = Math.min(1, TARGET_WIDTH / Math.max(vw, vh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Sem suporte a imagem neste aparelho");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("Falha ao capturar"))), "image/jpeg", 0.92),
    );
  } finally {
    canvas.width = canvas.height = 0;
  }
}

export function InAppCamera(props: {
  open: boolean;
  title: string;
  count: number;
  onClose: () => void;
  onCapture: (blob: Blob) => Promise<void>;
  onNative: (reason: "falha" | "escolha") => void;
}) {
  const { open, onClose, onCapture, onNative } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"starting" | "live" | "paused">("starting");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [zoom, setZoom] = useState<Range & { value: number } | null>(null);
  const [last, setLast] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const fail = useCallback(() => {
    stop();
    onClose();
    onNative("falha");
  }, [stop, onClose, onNative]);

  const start = useCallback(async () => {
    if (!supportsInAppCamera()) return fail();
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      });
      if (!streamRef.current && document.visibilityState === "hidden") {
        stream.getTracks().forEach((t) => t.stop());
        setState("paused");
        return;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => undefined);
      }
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean; zoom?: Range };
      setTorch(caps.torch ? false : null);
      setZoom(caps.zoom?.max ? { ...caps.zoom, value: caps.zoom.min ?? 1 } : null);
      setState("live");
    } catch {
      fail();
    }
  }, [fail]);

  useEffect(() => {
    if (!open) return;
    void start();
    const vis = () => {
      if (document.visibilityState === "hidden") {
        stop();
        setState("paused");
      } else if (!streamRef.current) void start();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      stop();
    };
  }, [open, start, stop]);

  useEffect(
    () => () => {
      if (last) URL.revokeObjectURL(last);
    },
    [last],
  );

  async function shoot() {
    if (busyRef.current) return;
    const track = streamRef.current?.getVideoTracks()[0];
    const video = videoRef.current;
    if (!track || !video) return;
    busyRef.current = true;
    setBusy(true);
    try {
      let blob: Blob | null = null;
      const IC = (globalThis as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
      if (IC) {
        try {
          const ic = new IC(track);
          const caps = await ic.getPhotoCapabilities?.().catch(() => undefined);
          const w = pickPhotoWidth(caps?.imageWidth);
          blob = await ic.takePhoto(w ? { imageWidth: w } : undefined);
        } catch {
          blob = null;
        }
      }
      if (!blob) blob = await frameFromVideo(video);
      await onCapture(blob);
      setLast(URL.createObjectURL(blob.size > 4_000_000 ? await frameFromVideo(video) : blob));
    } catch {
      /* onCapture já avisa */
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  }
  async function changeZoom(value: number) {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !zoom) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
      setZoom({ ...zoom, value });
    } catch {
      setZoom(null);
    }
  }

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Câmera do app"
      className="fixed inset-0 z-[60] flex flex-col bg-foreground text-background"
    >
      <div className="flex items-center justify-between gap-2 p-3 text-sm">
        <span className="truncate font-semibold">{props.title}</span>
        <span aria-live="polite">{props.count} foto(s) neste cômodo</span>
      </div>
      <div className="relative min-h-0 flex-1">
        <video ref={videoRef} playsInline muted autoPlay className="size-full object-contain" />
        {state !== "live" && (
          <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm">
            {state === "paused" ? "Câmera pausada." : CAMERA_INTRO}
          </p>
        )}
      </div>
      {zoom && (
        <input
          type="range"
          aria-label="Zoom"
          className="mx-6 my-2"
          min={zoom.min ?? 1}
          max={zoom.max}
          step={zoom.step ?? 0.1}
          value={zoom.value}
          onChange={(e) => void changeZoom(Number(e.target.value))}
        />
      )}
      <div className="grid grid-cols-3 items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          {last && <img src={last} alt="Última foto" className="size-12 rounded-lg object-cover" />}
          {torch !== null && (
            <button
              type="button"
              aria-label={torch ? "Desligar lanterna" : "Ligar lanterna"}
              onClick={() => void toggleTorch()}
              className="grid size-11 place-items-center rounded-full border border-background/40"
            >
              {torch ? <ZapOff className="size-5" /> : <Zap className="size-5" />}
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label={busy ? "Salvando…" : "Tirar foto"}
          disabled={busy || state !== "live"}
          onClick={() => void shoot()}
          className="mx-auto grid size-18 place-items-center rounded-full border-4 border-background bg-background/20 disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-7 animate-spin" /> : <Camera className="size-7" />}
        </button>
        <button
          type="button"
          onClick={() => {
            stop();
            onClose();
          }}
          className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-xl bg-background px-4 text-sm font-semibold text-foreground"
        >
          <Check className="size-4" /> Concluir
        </button>
      </div>
      {busy && <p className="pb-2 text-center text-xs">Salvando…</p>}
      <button
        type="button"
        onClick={() => {
          stop();
          onClose();
          onNative("escolha");
        }}
        className="pb-4 text-center text-xs underline opacity-80"
      >
        Usar câmera do celular
      </button>
    </div>
  );
}
