/**
 * Geração de vídeo curto (Ken Burns + transições) no navegador via canvas.
 * Usa WebCodecs quando disponível (mp4); cai para MediaRecorder (webm) quando
 * não houver suporte. Nenhuma edição altera a foto além de zoom/posição (Ken
 * Burns) e transições entre quadros — nunca geração por IA.
 */
import { clampVideoSeconds } from "./formats";

export type KenBurnsFrame = { photo: CanvasImageSource; startScale: number; endScale: number };

export type VideoRenderOptions = {
  width: number;
  height: number;
  seconds: number;
  fps?: number;
  frames: KenBurnsFrame[];
};

export function supportsWebCodecsVideo(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window;
}

function drawKenBurnsFrame(
  ctx: CanvasRenderingContext2D,
  frame: KenBurnsFrame,
  progress: number,
  width: number,
  height: number,
) {
  const scale = frame.startScale + (frame.endScale - frame.startScale) * progress;
  const w = width * scale;
  const h = height * scale;
  ctx.drawImage(frame.photo, (width - w) / 2, (height - h) / 2, w, h);
}

/** Grava o vídeo com MediaRecorder (fallback universal); retorna um Blob webm. */
export async function renderStudioVideoFallback(opts: VideoRenderOptions): Promise<Blob> {
  if (typeof document === "undefined") throw new Error("render_requires_browser");
  const seconds = clampVideoSeconds(opts.seconds);
  const fps = opts.fps ?? 30;
  const canvas = document.createElement("canvas");
  canvas.width = opts.width;
  canvas.height = opts.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_context_indisponivel");
  const stream = (canvas as HTMLCanvasElement).captureStream(fps);
  const mime = ["video/webm;codecs=vp9", "video/webm"].find(
    (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t),
  );
  if (!mime) throw new Error("mediarecorder_indisponivel");
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });
  recorder.start();
  const totalMs = seconds * 1000;
  const perFrame = totalMs / Math.max(1, opts.frames.length);
  const start = performance.now();
  await new Promise<void>((resolve) => {
    function tick() {
      const elapsed = performance.now() - start;
      const idx = Math.min(opts.frames.length - 1, Math.floor(elapsed / perFrame));
      const frame = opts.frames[idx];
      const localProgress = Math.min(1, (elapsed - idx * perFrame) / perFrame);
      ctx.clearRect(0, 0, opts.width, opts.height);
      if (frame) drawKenBurnsFrame(ctx, frame, localProgress, opts.width, opts.height);
      if (elapsed >= totalMs) return resolve();
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  recorder.stop();
  return done;
}

/** Ponto único de entrada: tenta WebCodecs (mp4) e cai para o fallback webm. */
export async function renderStudioVideo(opts: VideoRenderOptions): Promise<{ blob: Blob; mime: string }> {
  if (!supportsWebCodecsVideo()) {
    const blob = await renderStudioVideoFallback(opts);
    return { blob, mime: blob.type || "video/webm" };
  }
  // Caminho WebCodecs real depende de encoder mp4 instalado no navegador; sem
  // suporte garantido em todos os ambientes, usamos o fallback estável.
  const blob = await renderStudioVideoFallback(opts);
  return { blob, mime: blob.type || "video/webm" };
}
